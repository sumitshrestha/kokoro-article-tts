// Clean text extraction with paragraph preservation
function extractText(action) {
  if (action === 'readSelection') {
    const selected = window.getSelection().toString().trim();
    return selected || null;
  }

  const container = document.querySelector('.mbh-content');
  if (!container) {
    // Fallback for non-Mahabharata sites
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(parent);
          if (
            parent.tagName === 'SCRIPT' ||
            parent.tagName === 'STYLE' ||
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            parseFloat(style.fontSize) < 8
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let text = '';
    let node;
    while (node = walker.nextNode()) {
      text += node.textContent + ' ';
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  // Clone to avoid modifying live DOM
  const clone = container.cloneNode(true);

  // Convert <br><br> to paragraph markers
  const brs = Array.from(clone.querySelectorAll('br'));
  let i = 0;
  while (i < brs.length - 1) {
    const current = brs[i];
    const next = brs[i + 1];

    // Check if next BR exists and is immediately adjacent
    if (next && next.previousSibling === current) {
      // Found <br><br>
      const marker = document.createTextNode('||PARA||');
      current.parentNode.insertBefore(marker, current);
      // Remove both <br> tags
      current.parentNode.removeChild(current);
      next.parentNode.removeChild(next);

      // Rebuild the array after DOM changes
      const updatedBrs = Array.from(clone.querySelectorAll('br'));
      // Continue from where we left off
      i = Math.max(0, updatedBrs.indexOf(current) - 1);
      // Update the brs array reference
      brs.length = 0;
      brs.push(...updatedBrs);
    } else {
      i++;
    }
  }

  // Get text and convert markers
  let text = clone.textContent || '';
  text = text.replace(/\|\|PARA\|\|/g, '\n\n');
  // Clean up extra whitespace but preserve paragraph breaks
  text = text
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')          // collapse spaces/tabs
    .replace(/\n\s*\n/g, '\n\n')      // normalize paragraph breaks
    .trim();

  return text;
}

// Send to TTS service
async function sendToTTS(text, params) {
  if (!text) return { error: 'No text to read' };

  console.log('📤 Content script sending TTS request:', {
    textLength: text.length,
    voice: params.voice,
    speed: params.speed,
    lang: params.lang
  });

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'TTS_REQUEST',
        payload: {
          text,
          voice: params.voice || 'af_bella',
          speed: params.speed || 1.0,
          lang: params.lang || 'en-us'
        }
      },
      (response) => {
        if (response?.success) {
          resolve(response.data);
        } else {
          resolve({ error: response?.error || 'Unknown background error' });
        }
      }
    );
  });
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received message:', request);

  if (request.action === 'readSelection' || request.action === 'readPage') {
    const text = extractText(request.action);

    // Pass all parameters to sendToTTS
    const params = {
      voice: request.voice || 'af_bella',
      speed: request.speed || 1.0,
      lang: request.lang || 'en-us'
    };

    console.log('📋 Extracted params:', params);

    sendToTTS(text, params).then(sendResponse);
  }
  return true; // Required for async response
});