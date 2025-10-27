// Voice mapping by language - Complete Kokoro voice list
const VOICES = {
  'en-us': {
    female: [
      { value: 'af_bella', label: 'Bella (A-)' },
      { value: 'af_nicole', label: 'Nicole (B-)' },
      { value: 'af_aoede', label: 'Aoede (C+)' },
      { value: 'af_kore', label: 'Kore (C+)' },
      { value: 'af_sarah', label: 'Sarah (C+)' },
      { value: 'af_alloy', label: 'Alloy (C)' },
      { value: 'af_nova', label: 'Nova (C)' },
      { value: 'af_sky', label: 'Sky (C-)' },
      { value: 'af_jessica', label: 'Jessica (D)' },
      { value: 'af_river', label: 'River (D)' }
    ],
    male: [
      { value: 'am_fenrir', label: 'Fenrir (C+)' },
      { value: 'am_michael', label: 'Michael (C+)' },
      { value: 'am_puck', label: 'Puck (C+)' },
      { value: 'am_echo', label: 'Echo (D)' },
      { value: 'am_eric', label: 'Eric (D)' },
      { value: 'am_liam', label: 'Liam (D)' },
      { value: 'am_onyx', label: 'Onyx (D)' },
      { value: 'am_santa', label: 'Santa (D-)' },
      { value: 'am_adam', label: 'Adam (F+)' }
    ]
  },
  'en-gb': {
    female: [
      { value: 'bf_emma', label: 'Emma (B-)' },
      { value: 'bf_isabella', label: 'Isabella (C)' },
      { value: 'bf_alice', label: 'Alice (D)' },
      { value: 'bf_lily', label: 'Lily (D)' }
    ],
    male: [
      { value: 'bm_fable', label: 'Fable (C)' },
      { value: 'bm_george', label: 'George (C)' },
      { value: 'bm_lewis', label: 'Lewis (D+)' },
      { value: 'bm_daniel', label: 'Daniel (D)' }
    ]
  },
  'ja': {
    female: [
      { value: 'jf_alpha', label: 'Alpha (C+)' },
      { value: 'jf_gongitsune', label: 'Gongitsune (C)' },
      { value: 'jf_tebukuro', label: 'Tebukuro (C)' },
      { value: 'jf_nezumi', label: 'Nezumi (C-)' }
    ],
    male: [
      { value: 'jm_kumo', label: 'Kumo (C-)' }
    ]
  },
  'cmn': {
    female: [
      { value: 'zf_xiaobei', label: 'Xiaobei (D)' },
      { value: 'zf_xiaoni', label: 'Xiaoni (D)' },
      { value: 'zf_xiaoxiao', label: 'Xiaoxiao (D)' },
      { value: 'zf_xiaoyi', label: 'Xiaoyi (D)' }
    ],
    male: [
      { value: 'zm_yunjian', label: 'Yunjian (D)' },
      { value: 'zm_yunxi', label: 'Yunxi (D)' },
      { value: 'zm_yunxia', label: 'Yunxia (D)' },
      { value: 'zm_yunyang', label: 'Yunyang (D)' }
    ]
  },
  'es': {
    female: [
      { value: 'ef_dora', label: 'Dora' }
    ],
    male: [
      { value: 'em_alex', label: 'Alex' },
      { value: 'em_santa', label: 'Santa' }
    ]
  },
  'fr-fr': {
    female: [
      { value: 'ff_siwis', label: 'Siwis (B-)' }
    ]
  },
  'hi': {
    female: [
      { value: 'hf_alpha', label: 'Alpha (C)' },
      { value: 'hf_beta', label: 'Beta (C)' }
    ],
    male: [
      { value: 'hm_omega', label: 'Omega (C)' },
      { value: 'hm_psi', label: 'Psi (C)' }
    ]
  },
  'it': {
    female: [
      { value: 'if_sara', label: 'Sara (C)' }
    ],
    male: [
      { value: 'im_nicola', label: 'Nicola (C)' }
    ]
  },
  'pt-br': {
    female: [
      { value: 'pf_dora', label: 'Dora' }
    ],
    male: [
      { value: 'pm_alex', label: 'Alex' },
      { value: 'pm_santa', label: 'Santa' }
    ]
  }
};

// Simple localStorage wrapper for settings
const Settings = {
  get(keys, callback) {
    const defaults = {
      language: 'en-us',
      voice: 'af_bella',
      speed: 1.0
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(keys, callback);
    } else {
      // Fallback to localStorage
      const result = {};
      keys.forEach(key => {
        const value = localStorage.getItem(`tts_${key}`);
        result[key] = value ? JSON.parse(value) : defaults[key];
      });
      callback(result);
    }
  },

  set(items) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(items);
    } else {
      // Fallback to localStorage
      Object.keys(items).forEach(key => {
        localStorage.setItem(`tts_${key}`, JSON.stringify(items[key]));
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  const serviceStatus = document.getElementById('serviceStatus');
  const languageSelect = document.getElementById('language');
  const voiceSelect = document.getElementById('voice');
  const speedSlider = document.getElementById('speed');
  const speedValue = document.getElementById('speedValue');
  const readSelectionBtn = document.getElementById('readSelection');
  const readPageBtn = document.getElementById('readPage');
  const stopBtn = document.getElementById('stopReading');

  // Initially disable stop button
  stopBtn.disabled = true;

  // Load saved preferences
  Settings.get(['language', 'voice', 'speed'], (result) => {
    if (result.language) languageSelect.value = result.language;
    if (result.speed) {
      speedSlider.value = result.speed;
      speedValue.textContent = result.speed + 'x';
    }

    // Populate voices for selected language
    populateVoices(languageSelect.value);

    if (result.voice) voiceSelect.value = result.voice;
  });

  // Populate voice dropdown based on language
  function populateVoices(lang) {
    const voices = VOICES[lang] || VOICES['en-us'];
    voiceSelect.innerHTML = '';

    // Add female voices
    if (voices.female && voices.female.length > 0) {
      const femaleGroup = document.createElement('optgroup');
      femaleGroup.label = 'Female Voices';
      voices.female.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.value;
        option.textContent = voice.label;
        femaleGroup.appendChild(option);
      });
      voiceSelect.appendChild(femaleGroup);
    }

    // Add male voices
    if (voices.male && voices.male.length > 0) {
      const maleGroup = document.createElement('optgroup');
      maleGroup.label = 'Male Voices';
      voices.male.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.value;
        option.textContent = voice.label;
        maleGroup.appendChild(option);
      });
      voiceSelect.appendChild(maleGroup);
    }
  }

  // Language change handler
  languageSelect.addEventListener('change', () => {
    populateVoices(languageSelect.value);
    Settings.set({ language: languageSelect.value });
  });

  // Voice change handler
  voiceSelect.addEventListener('change', () => {
    Settings.set({ voice: voiceSelect.value });
  });

  // Speed slider handler
  speedSlider.addEventListener('input', () => {
    const speed = parseFloat(speedSlider.value);
    speedValue.textContent = speed.toFixed(1) + 'x';
  });

  speedSlider.addEventListener('change', () => {
    Settings.set({ speed: parseFloat(speedSlider.value) });
  });

  // Check service health on popup open
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'HEALTH_CHECK' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Health check error:', chrome.runtime.lastError);
        serviceStatus.textContent = '❌ Extension error';
        serviceStatus.className = 'service-status offline';
        return;
      }

      if (response?.success) {
        const health = response.data;
        if (health.status === 'healthy' || health.status.includes('healthy')) {
          serviceStatus.textContent = '✅ Service online';
          serviceStatus.className = 'service-status online';
        } else {
          serviceStatus.textContent = `⚠️ ${health.status}`;
          serviceStatus.className = 'service-status offline';
        }
      } else {
        serviceStatus.textContent = '❌ Service offline';
        serviceStatus.className = 'service-status offline';
      }
    });
  } else {
    serviceStatus.textContent = '❌ Chrome API unavailable';
    serviceStatus.className = 'service-status offline';
  }

  const sendMessage = (action) => {
    status.textContent = "🔄 Processing text...";
    status.className = "processing";

    // Disable read buttons, enable stop button during processing
    readSelectionBtn.disabled = true;
    readPageBtn.disabled = true;
    stopBtn.disabled = false;

    const params = {
      action,
      voice: voiceSelect.value,
      speed: parseFloat(speedSlider.value),
      lang: languageSelect.value
    };

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        status.textContent = "❌ No active tab found";
        status.className = "error";
        readSelectionBtn.disabled = false;
        readPageBtn.disabled = false;
        stopBtn.disabled = true;
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, params, (response) => {
        // Re-enable read buttons, disable stop button
        readSelectionBtn.disabled = false;
        readPageBtn.disabled = false;
        stopBtn.disabled = true;

        if (chrome.runtime.lastError) {
          status.textContent = "❌ " + chrome.runtime.lastError.message;
          status.className = "error";
        } else if (response?.error) {
          status.textContent = "❌ " + response.error;
          status.className = "error";
        } else if (response?.success) {
          const duration = response.duration_sec?.toFixed(1) || '?';
          const paragraphs = response.paragraphs || '?';
          status.textContent = `✅ Playing ${paragraphs} paragraph${paragraphs !== 1 ? 's' : ''} (${duration}s)`;
          status.className = "success";
        } else {
          status.textContent = "❌ Unexpected response";
          status.className = "error";
        }
      });
    });
  };

  readSelectionBtn.addEventListener('click', () => {
    sendMessage('readSelection');
  });

  readPageBtn.addEventListener('click', () => {
    sendMessage('readPage');
  });

  stopBtn.addEventListener('click', () => {
    console.log('🛑 Stop button clicked');
    status.textContent = "🛑 Stopping playback...";
    status.className = "processing";

    chrome.runtime.sendMessage({ type: 'TTS_STOP' }, (response) => {
      console.log('Stop response received:', response);

      stopBtn.disabled = true;
      readSelectionBtn.disabled = false;
      readPageBtn.disabled = false;

      if (chrome.runtime.lastError) {
        console.error('Stop error:', chrome.runtime.lastError);
        status.textContent = "❌ Error: " + chrome.runtime.lastError.message;
        status.className = "error";
        return;
      }

      if (response?.success) {
        status.textContent = "⏹️ Playback stopped";
        status.className = "success";
      } else {
        status.textContent = response?.message || "⚠️ No active playback";
        status.className = "error";
      }
    });
  });
});