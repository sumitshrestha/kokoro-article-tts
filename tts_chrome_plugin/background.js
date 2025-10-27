// background.js
let currentSessionId = null;  // Track current TTS session

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TTS_REQUEST') {
    const { text, voice, speed, lang } = request.payload;

    // Generate new session ID for this request
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    currentSessionId = sessionId;

    console.log('🎤 TTS Request received:', {
      sessionId,
      textLength: text?.length,
      voice,
      speed,
      lang
    });

    // Add default parameters to match Flask backend expectations
    fetch('http://localhost:5000/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voice: voice || 'af_bella',
        speed: speed || 1.0,
        lang: lang || 'en-us',
        session_id: sessionId
      })
    })
      .then(res => {
        console.log('📡 Response status:', res.status);
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || `HTTP ${res.status}`);
          }).catch((err) => {
            if (err.message && err.message.includes('HTTP')) {
              throw err;
            }
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          });
        }
        return res.json();
      })
      .then(data => {
        console.log('✅ TTS Success:', data);

        // Update session ID from response if provided
        if (data.session_id) {
          currentSessionId = data.session_id;
          console.log('📌 Session ID updated:', currentSessionId);
        }

        if (data.success) {
          sendResponse({
            success: true,
            data: {
              success: data.success,
              saved_as: data.saved_as,
              voice: data.voice,
              paragraphs: data.paragraphs,
              duration_sec: data.duration_sec,
              session_id: data.session_id
            }
          });
        } else {
          sendResponse({
            success: false,
            error: data.error || 'TTS processing failed'
          });
        }

        // Clear session after completion
        if (currentSessionId === sessionId || currentSessionId === data.session_id) {
          console.log('🧹 Clearing session ID');
          currentSessionId = null;
        }
      })
      .catch(err => {
        console.error('❌ TTS Error:', err);
        let errorMsg = err.message || 'Fetch failed';

        // User-friendly error messages
        if (errorMsg.includes('Failed to fetch')) {
          errorMsg = 'Cannot connect to TTS server. Is it running on localhost:5000?';
        }

        sendResponse({
          success: false,
          error: errorMsg
        });

        // Clear session on error
        if (currentSessionId === sessionId) {
          currentSessionId = null;
        }
      });

    return true; // keep channel open for async
  }

  if (request.type === 'TTS_STOP') {
    console.log('🛑 Stop request received, current session:', currentSessionId);

    if (!currentSessionId) {
      console.log('⚠️ No active session to stop');
      sendResponse({
        success: false,
        message: 'No active TTS session'
      });
      return true;
    }

    const sessionToStop = currentSessionId;
    console.log('📤 Sending stop request for session:', sessionToStop);

    fetch('http://localhost:5000/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionToStop
      })
    })
      .then(res => {
        console.log('📡 Stop response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('✅ Stop response:', data);
        currentSessionId = null;
        sendResponse({ success: data.success, message: data.message });
      })
      .catch(err => {
        console.error('❌ Stop error:', err);
        sendResponse({
          success: false,
          error: err.message || 'Failed to stop'
        });
      });

    return true;
  }

  if (request.type === 'HEALTH_CHECK') {
    console.log('🏥 Health check requested');

    fetch('http://localhost:5000/health')
      .then(res => {
        console.log('📡 Health response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('✅ Health check data:', data);
        sendResponse({ success: true, data });
      })
      .catch(err => {
        console.error('❌ Health check error:', err);
        sendResponse({
          success: false,
          error: 'TTS service unavailable'
        });
      });
    return true;
  }
});