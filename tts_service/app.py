# app.py
import os
import time
import threading
import uuid
import re
import numpy as np
from flask import Flask, request, jsonify
import sounddevice as sd
import soundfile as sf
from kokoro_onnx import Kokoro
from flask_cors import CORS
from queue import Queue

# ======================
# CONFIGURATION
# ======================
MODEL_PATH = "kokoro-v1.0.onnx"
VOICES_PATH = "voices-v1.0.bin"
SAVE_FOLDER = "tts_output"
IDLE_TIMEOUT = 60
DEFAULT_VOICE = "af_bella"
DEFAULT_SPEED = 1.0
DEFAULT_LANG = "en-us"

os.makedirs(SAVE_FOLDER, exist_ok=True)

# Global state
_model = None
_last_used = 0
_start_time = time.time()
_lock = threading.Lock()
_active_requests = 0
_synthesis_lock = threading.Lock()
_stop_flags = {}  # Track stop requests by session_id


def get_model():
    global _model, _last_used
    with _lock:
        now = time.time()
        _last_used = now
        if _model is None:
            print("🧠 Loading Kokoro TTS model...")
            try:
                _model = Kokoro(MODEL_PATH, VOICES_PATH)
                print("✅ Kokoro TTS loaded!")
            except Exception as e:
                print(f"❌ Failed to load model: {str(e)}")
                raise Exception(f"Failed to load TTS model: {str(e)}")
        return _model


def unload_model_if_idle():
    global _model
    while True:
        time.sleep(IDLE_TIMEOUT)
        with _lock:
            if (
                _model is not None
                and _active_requests == 0
                and (time.time() - _last_used) > IDLE_TIMEOUT
            ):
                print("💤 Unloading Kokoro TTS model due to inactivity...")
                try:
                    del _model
                    _model = None
                    print("📉 Model unloaded. Memory freed.")
                except Exception as e:
                    print(f"⚠️ Error unloading model: {str(e)}")
                    _model = None


threading.Thread(target=unload_model_if_idle, daemon=True).start()


def split_into_paragraphs(text: str) -> list:
    """Split by double newlines or excessive spacing."""
    text = re.sub(r"\r\n|\r", "\n", text)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    return paragraphs if paragraphs else [text.strip()]


def synthesis_worker(kokoro, paragraphs, voice, speed, lang, audio_queue, session_id):
    """
    Worker thread that synthesizes paragraphs sequentially and puts them in queue.
    Synthesis must be sequential due to model limitations.
    """
    try:
        for i, para in enumerate(paragraphs):
            # Check if stop requested
            if _stop_flags.get(session_id, False):
                print(f"  🛑 Synthesis stopped for session {session_id}")
                audio_queue.put(None)
                return

            print(f"  → Synthesizing paragraph {i + 1}/{len(paragraphs)}")

            # Lock synthesis to prevent concurrent access to model
            with _synthesis_lock:
                samples, sr = kokoro.create(para, voice=voice, speed=speed, lang=lang)

            audio_queue.put((i, samples, sr))
            print(f"  ✓ Paragraph {i + 1} ready")

        # Signal completion
        audio_queue.put(None)
    except Exception as e:
        print(f"❌ Synthesis error: {str(e)}")
        audio_queue.put(("error", str(e)))


def play_with_prefetch(paragraphs, voice, speed, lang, kokoro, session_id):
    """
    Synthesize and play paragraphs with prefetching.
    Synthesis happens in background thread, playback waits for queue.
    Returns all audio chunks for final file saving.
    """
    audio_queue = Queue(maxsize=3)  # Buffer up to 3 paragraphs
    all_chunks = []
    sample_rate = None

    # Start synthesis thread
    synthesis_thread = threading.Thread(
        target=synthesis_worker,
        args=(kokoro, paragraphs, voice, speed, lang, audio_queue, session_id),
        daemon=True,
    )
    synthesis_thread.start()

    # Play paragraphs as they become ready
    paragraph_count = 0
    while paragraph_count < len(paragraphs):
        # Check if stop requested
        if _stop_flags.get(session_id, False):
            print(f"  🛑 Playback stopped for session {session_id}")
            sd.stop()
            break

        item = audio_queue.get()

        if item is None:
            # Synthesis complete
            break

        if isinstance(item, tuple) and item[0] == "error":
            raise Exception(item[1])

        i, samples, sr = item

        if sample_rate is None:
            sample_rate = sr

        all_chunks.append(samples)
        paragraph_count += 1

        # Check stop flag before playing
        if _stop_flags.get(session_id, False):
            print(f"  🛑 Playback stopped before paragraph {i + 1}")
            break

        # Play current paragraph
        print(f"  ▶️  Playing paragraph {i + 1}/{len(paragraphs)}")
        sd.play(samples, sr)

        # ALWAYS wait for current paragraph to finish before playing next
        # This ensures sequential playback order
        sd.wait()

        # Check stop flag after playing
        if _stop_flags.get(session_id, False):
            print(f"  🛑 Playback stopped after paragraph {i + 1}")
            break

        print(f"  ✓ Finished playing paragraph {i + 1}/{len(paragraphs)}")

    synthesis_thread.join(timeout=5)

    # Clean up stop flag
    _stop_flags.pop(session_id, None)

    return all_chunks, sample_rate


app = Flask(__name__)
CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",  # Allow all origins for local development
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"],
        }
    },
)


@app.route("/health", methods=["GET"])
def health_check():
    with _lock:
        model_loaded = _model is not None
        uptime = time.time() - _start_time
        status = "healthy"
        if not os.path.exists(MODEL_PATH) or not os.path.exists(VOICES_PATH):
            status = "degraded: model files missing"
        elif not model_loaded:
            status = "healthy (model unloaded - idle)"
    return jsonify(
        {
            "status": status,
            "uptime_seconds": round(uptime, 2),
            "model_loaded": model_loaded,
            "model_file": MODEL_PATH,
            "voices_file": VOICES_PATH,
            "idle_timeout_seconds": IDLE_TIMEOUT,
        }
    )


@app.route("/tts", methods=["POST"])
def tts_endpoint():
    global _active_requests

    # Increment active request count FIRST (before any potential failures)
    with _lock:
        _active_requests += 1

    try:
        start_time = time.time()
        data = request.get_json()
        raw_text = data.get("text", "").strip()
        voice = data.get("voice", DEFAULT_VOICE)
        speed = float(data.get("speed", DEFAULT_SPEED))
        lang = data.get("lang", DEFAULT_LANG)
        session_id = data.get(
            "session_id", str(uuid.uuid4())
        )  # Get or create session ID

        print(f"📥 TTS Request received:")
        print(f"   Session ID: {session_id}")
        print(f"   Text length: {len(raw_text)} characters")
        print(f"   Language: {lang}")
        print(f"   Voice: {voice}")
        print(f"   Speed: {speed}")

        print(f"Received text: {raw_text[:100]}...")

        if not raw_text:
            return jsonify({"error": "No text provided"}), 400

        valid_voices = {
            # American English
            "af_heart",
            "af_alloy",
            "af_aoede",
            "af_bella",
            "af_jessica",
            "af_kore",
            "af_nicole",
            "af_nova",
            "af_river",
            "af_sarah",
            "af_sky",
            "am_adam",
            "am_echo",
            "am_eric",
            "am_fenrir",
            "am_liam",
            "am_michael",
            "am_onyx",
            "am_puck",
            "am_santa",
            # British English
            "bf_alice",
            "bf_emma",
            "bf_isabella",
            "bf_lily",
            "bm_daniel",
            "bm_fable",
            "bm_george",
            "bm_lewis",
            # Japanese
            "jf_alpha",
            "jf_gongitsune",
            "jf_nezumi",
            "jf_tebukuro",
            "jm_kumo",
            # Mandarin Chinese
            "zf_xiaobei",
            "zf_xiaoni",
            "zf_xiaoxiao",
            "zf_xiaoyi",
            "zm_yunjian",
            "zm_yunxi",
            "zm_yunxia",
            "zm_yunyang",
            # Spanish
            "ef_dora",
            "em_alex",
            "em_santa",
            # French
            "ff_siwis",
            # Hindi
            "hf_alpha",
            "hf_beta",
            "hm_omega",
            "hm_psi",
            # Italian
            "if_sara",
            "im_nicola",
            # Brazilian Portuguese
            "pf_dora",
            "pm_alex",
            "pm_santa",
        }
        if voice not in valid_voices:
            voice = DEFAULT_VOICE

        paragraphs = split_into_paragraphs(raw_text)
        print(f"📄 Processing {len(paragraphs)} paragraph(s) with prefetch")

        # Get model (will reload if necessary)
        try:
            kokoro = get_model()
        except Exception as e:
            print(f"❌ Failed to get model: {str(e)}")
            return jsonify({"error": f"Failed to load TTS model: {str(e)}"}), 500

        # Initialize stop flag for this session
        _stop_flags[session_id] = False

        # Process with prefetching (synthesis runs ahead of playback)
        full_audio_chunks, sample_rate = play_with_prefetch(
            paragraphs, voice, speed, lang, kokoro, session_id
        )

        # Save immediately after synthesis completes (before playback finishes)
        if full_audio_chunks:
            final_audio = (
                np.concatenate(full_audio_chunks)
                if len(full_audio_chunks) > 1
                else full_audio_chunks[0]
            )
            filename = f"tts_{voice}_{uuid.uuid4().hex[:8]}.wav"
            filepath = os.path.join(SAVE_FOLDER, filename)
            sf.write(filepath, final_audio, sample_rate)

            total_time = time.time() - start_time
            print(f"✅ Full audio saved as {filename} ({total_time:.2f}s)")

            return jsonify(
                {
                    "success": True,
                    "saved_as": filename,
                    "voice": voice,
                    "paragraphs": len(paragraphs),
                    "duration_sec": len(final_audio) / sample_rate,
                    "session_id": session_id,
                }
            )
        else:
            # Request was stopped before any audio was generated
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Playback stopped",
                        "session_id": session_id,
                    }
                ),
                200,
            )

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        with _lock:
            _active_requests -= 1
            _last_used = time.time()


@app.route("/stop", methods=["POST"])
def stop_endpoint():
    """Stop ongoing TTS playback for a session"""
    print("🛑 Stop request received")
    try:
        data = request.get_json()
        session_id = data.get("session_id")

        if not session_id:
            return jsonify({"error": "No session_id provided"}), 400

        if session_id in _stop_flags:
            _stop_flags[session_id] = True
            sd.stop()  # Stop any active audio playback
            print(f"🛑 Stop request received for session {session_id}")
            return jsonify(
                {"success": True, "message": f"Stopped session {session_id}"}
            )
        else:
            return (
                jsonify(
                    {
                        "success": False,
                        "message": f"No active session found: {session_id}",
                    }
                ),
                404,
            )

    except Exception as e:
        print(f"❌ Stop error: {str(e)}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print(f"🚀 Kokoro TTS server (parallel prefetch playback)")
    print(f"📁 Audio saved to: {os.path.abspath(SAVE_FOLDER)}")
    print(f"🧪 Health check: http://localhost:5000/health")
    app.run(host="localhost", port=5000, debug=False, threaded=True)
