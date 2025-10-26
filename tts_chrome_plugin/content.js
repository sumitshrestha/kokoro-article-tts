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
  const brs = clone.querySelectorAll('br');
  let i = 0;
  while (i < brs.length - 1) {
    const current = brs[i];
    const next = brs[i + 1];
    if (next && next === current.nextSibling) {
      // Found <br><br>
      const marker = document.createTextNode('||PARA||');
      clone.insertBefore(marker, current);
      // Remove both <br> tags
      clone.removeChild(current);
      clone.removeChild(next);
      // Re-query brs since DOM changed
      const newBrs = clone.querySelectorAll('br');
      i = Array.from(newBrs).indexOf(marker.nextSibling?.nextElementSibling) || 0;
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
async function sendToTTS(text, voice) {
  if (!text) return { error: 'No text to read' };

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'TTS_REQUEST',
        payload: { text, voice }
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
  if (request.action === 'readSelection' || request.action === 'readPage') {
    const text = extractText(request.action);
    sendToTTS(text, request.voice).then(sendResponse);
  }
  return true; // Required for async response
});