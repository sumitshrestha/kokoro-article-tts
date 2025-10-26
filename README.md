# internet_article_tts

Text-to-speech for online articles — a small Chrome extension (`tts_chrome_plugin/`) plus a local TTS service (`tts_service/`).

## Quick overview
- `tts_chrome_plugin/` — Chrome extension sources (load as an unpacked extension for testing).
- `tts_service/` — Python TTS service and model files (ONNX + optional vocoder `.bin`).

## One-line
Read web articles aloud with a Chrome extension backed by a local Python TTS service.

## Setup (Windows PowerShell)
This repo includes `setup_env.ps1` to create a Python virtual environment, install dependencies from `tts_service/requirements.txt`, and download the model and vocoder files.

Run the script (interactive):

```powershell
powershell -ExecutionPolicy Bypass -File .\setup_env.ps1
```

Or set URLs in environment variables and run non-interactively:

```powershell
$env:MODEL_URL = 'https://example.com/path/to/kokoro-v1.0.onnx'
$env:VOCODER_URL = 'https://example.com/path/to/vocoder.bin'
powershell -ExecutionPolicy Bypass -File .\setup_env.ps1
```

The script will place downloaded files in `tts_service/` (e.g. `tts_service/kokoro-v1.0.onnx`).

## Running the service
After activating the virtual environment (created at `./.venv`), run the TTS service:

```powershell
& .\.venv\Scripts\Activate.ps1
python .\tts_service\app.py
```

## Chrome extension
Load `tts_chrome_plugin/` as an unpacked extension in Chrome/Edge to test the frontend.

## Notes
- The repository intentionally ignores `kokoro-v1.0.onnx` and `*.bin` in `.gitignore` — the setup script downloads them for you.
- If you already have the model files locally, copy them into `tts_service/`.
