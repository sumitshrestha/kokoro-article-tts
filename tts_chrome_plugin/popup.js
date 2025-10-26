document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  const voiceSelect = document.getElementById('voice');

  const sendMessage = (action) => {
    status.textContent = "Sending request...";
    status.className = "";

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action,
          voice: voiceSelect.value
        },
        (response) => {
          if (chrome.runtime.lastError) {
            status.textContent = "Extension error: " + chrome.runtime.lastError.message;
            status.className = "error";
          } else if (response?.error) {
            status.textContent = "TTS Error: " + response.error;
            status.className = "error";
          } else if (response?.success) {
            status.textContent = `✅ Playing (${response.paragraphs} para, ${response.duration_sec.toFixed(1)}s)`;
            status.className = "success";
          } else {
            status.textContent = "Unknown response";
            status.className = "error";
          }
        }
      );
    });
  };

  document.getElementById('readSelection').addEventListener('click', () => {
    sendMessage('readSelection');
  });

  document.getElementById('readPage').addEventListener('click', () => {
    sendMessage('readPage');
  });
});