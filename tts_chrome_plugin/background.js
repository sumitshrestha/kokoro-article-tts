// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TTS_REQUEST') {
    const { text, voice, speed, lang } = request.payload;

    console.log('🎤 TTS Request received:', {
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
        lang: lang || 'en-us'
      })
    })
      .then(res => {
        console.log('📡 Response status:', res.status);
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || `HTTP ${res.status}`);
          }).catch(() => {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          });
        }
        return res.json();
      })
      .then(data => {
        console.log('✅ TTS Success:', data);
        if (data.success) {
          sendResponse({
            success: true,
            data: {
              success: data.success,
              saved_as: data.saved_as,
              voice: data.voice,
              paragraphs: data.paragraphs,
              duration_sec: data.duration_sec
            }
          });
        } else {
          sendResponse({
            success: false,
            error: data.error || 'TTS processing failed'
          });
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
      });

    return true; // keep channel open for async
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