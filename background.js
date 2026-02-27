// Configuration
const CONFIG = {
  MAX_TOKENS: 4000,
  TOKEN_RATIO: 4,
};

const DEFAULT_MODEL = 'gpt-3.5-turbo';

// Extension state
let state = {
  apiKey: '',
  apiEndpoint: '',
  selectedModel: '',
  availableModels: [],
  prompts: []
};

// Load configuration (called on init or when storage changes)
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get([
      'apiKey',
      'apiEndpoint',
      'selectedModel',
      'customPrompts'
    ]);

    // Only update values if they are different to avoid unnecessary re-renders
    state.apiKey = result.apiKey || '';
    state.apiEndpoint = result.apiEndpoint || '';
    state.selectedModel = result.selectedModel || DEFAULT_MODEL;
    state.prompts = Array.isArray(result.customPrompts) ? result.customPrompts : [];
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
} 

// Create context menus
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Create main menu
    chrome.contextMenus.create({
      id: 'gpt-menu',
      title: 'GPT Helper', // stringa statica in plain english
      contexts: ['selection']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating main menu:', chrome.runtime.lastError);
      }
    });

    // Create prompt menu items first
    if (Array.isArray(state.prompts)) {
      state.prompts.forEach(prompt => {
        chrome.contextMenus.create({
          id: `prompt-${prompt.id}`,
          parentId: 'gpt-menu',
          title: prompt.name,
          contexts: ['selection']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error(`Error creating menu for prompt ${prompt.id}:`, chrome.runtime.lastError);
          }
        });
      });
    }

    // Create "Prompt on the Fly" last
    chrome.contextMenus.create({
      id: 'prompt-on-the-fly',
      parentId: 'gpt-menu',
      title: '✨ Prompt on the Fly',
      contexts: ['selection']
    });
  });
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  await loadConfig();
  createContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  // state should already be populated from last session, but refresh anyway
  if (area !== 'sync') return;

  // Instead of calling loadConfig for everything, update only the changed pieces.
  if (changes.apiKey) state.apiKey = changes.apiKey.newValue || '';
  if (changes.selectedModel) state.selectedModel = changes.selectedModel.newValue || DEFAULT_MODEL;

  if (changes.customPrompts) {
    state.prompts = Array.isArray(changes.customPrompts.newValue)
      ? changes.customPrompts.newValue
      : [];
    createContextMenus();
  }
});

// Handle config reload messages
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'reloadConfig') {
    await loadConfig();
    createContextMenus();
    sendResponse({ success: true });
  }
  return true;
});

// Keep-alive mechanism for Manifest v3 service worker. 5 minutes is sufficient
// (originally 20s, which can be wasteful).
setInterval(() => {
  chrome.runtime.getPlatformInfo(() => {});
}, 5 * 60 * 1000);


// Handle menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'prompt-on-the-fly') {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (promptMessage) => {
        const promptText = prompt(promptMessage);
        return promptText;
      },
      args: ['Enter your custom prompt']
    }, async (results) => {
      const promptText = results[0].result;
      if (promptText && promptText.trim()) {
        await processText(info.selectionText, promptText.trim(), tab);
      }
    });
  } else {
    const promptId = parseInt(info.menuItemId.split('-')[1]);
    const prompt = state.prompts.find(p => p.id === promptId);
    if (prompt) {
      // NON chiamare showChatWindow qui!
      await processText(info.selectionText, prompt.prompt, tab);
    }
  }
});

function buildChatCompletionsUrl(apiEndpoint) {
  const base = apiEndpoint.trim().replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

// Process text with the configured API
async function processText(text, promptText, tab) {
  // state is kept up-to-date via listeners, avoid loading each time
  if (!validateInput(text, tab)) return;

  try {
    await showChatWindow(tab, `${promptText}\n\n${text}`, null);

    const url = buildChatCompletionsUrl(state.apiEndpoint);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: state.selectedModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.'
          },
          {
            role: 'user',
            content: `${promptText}\n\nText: ${text}`
          }
        ],
        temperature: 0.7,
        max_tokens: CONFIG.MAX_TOKENS
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorBody}`);
    }

    const result = await response.json();
    const generatedText = result.choices[0].message.content;

    // Notify content script to append the assistant's response (cheaper than injecting code)
    chrome.tabs.sendMessage(tab.id, {
      action: 'appendChatResponse',
      responseText: generatedText
    }).catch(() => {
      // ignore errors if the page doesn't have the listener yet
    });

  } catch (error) {
    console.error('Processing error:', error);
    await showAlert(tab, `Error processing text: ${error.message}`);
  }
}

// Validate input before processing
function validateInput(text, tab) {
  if (!state.apiKey || !state.apiEndpoint || !state.selectedModel) {
    showAlert(tab, 'Please configure API settings in the extension options');
    return false;
  }
  
  if (!text || text.trim().length === 0) {
    showAlert(tab, 'Please select some text to process');
    return false;
  }
  
  return true;
}

async function showAlert(tab, message) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (alertMessage) => { alert(alertMessage); },
    args: [message]
  });
}

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  await showChatWindow(tab, '', '');
});

// Handle chat message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'chat') {
    (async () => {
      try {
        const { chatHistory = [] } = await chrome.storage.local.get(['chatHistory']);
        const url = buildChatCompletionsUrl(state.apiEndpoint);

        const messages = [
          { role: "system", content: "You are a helpful assistant." },
          ...chatHistory,
          { 
            role: "user", 
            content: request.context.originalText 
              ? `Context:\n${request.context.originalText}\n\nMessage: ${request.message}`
              : request.message
          }
        ];

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: state.selectedModel,
            messages: messages,
            temperature: 0.7,
            max_tokens: CONFIG.MAX_TOKENS
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API request failed (${response.status}): ${errorBody}`);
        }

        const result = await response.json();
        const assistantMessage = result.choices[0].message.content;

        // Keep only last 10 pairs of messages
        chatHistory.push(
          { role: 'user', content: request.message },
          { role: 'assistant', content: assistantMessage }
        );
        if (chatHistory.length > 20) {
          chatHistory.splice(0, 2);
        }

        await chrome.storage.local.set({ chatHistory });
        sendResponse({ message: assistantMessage });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }
});

// Unified chat window implementation
async function showChatWindow(tab, initialMessage = '', initialResponse = '') {
  try {
    // Get current state before injecting script
    const currentModel = state.selectedModel || DEFAULT_MODEL;

    // inject style only once per page/tab using a flag in session storage
    const alreadyInjected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!window.__gptHelperCssInjected
    });
    if (!alreadyInjected[0].result) {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['styles/result.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => { window.__gptHelperCssInjected = true; }
      });
    }

    const { overlayEnabled = true } = await chrome.storage.local.get(['overlayEnabled']);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (params) => {
        // Remove any previous container and overlay
        document.querySelectorAll('.gpt-helper-result, .gpt-helper-overlay').forEach(el => el.remove());

        // Create overlay if enabled
        let overlay = null;
        if (params.overlayEnabled) {
          overlay = document.createElement('div');
          overlay.className = 'gpt-helper-overlay';
          document.body.appendChild(overlay);
          void overlay.offsetHeight; // Force reflow
          overlay.classList.add('active');
        }

        // Main container
        container = document.createElement('div');
        container.className = 'gpt-helper-result';

        // Header
        const header = document.createElement('div');
        header.className = 'gpt-helper-draghandle';

        // Title
        const title = document.createElement('div');
        title.className = 'gpt-helper-title';
        title.textContent = 'GPT Chat';

        // Model name
        const modelName = document.createElement('div');
        modelName.textContent = `Model: ${params.currentModel}`;
        modelName.style.fontSize = '10px';
        modelName.style.color = '#999';
        modelName.style.marginLeft = '8px';
        title.appendChild(modelName);

        // Close button
        const closeButton = document.createElement('button');
        closeButton.className = 'gpt-helper-close';
        closeButton.innerHTML = '✕';
        header.appendChild(title);
        header.appendChild(closeButton);

        closeButton.addEventListener('click', () => {
          if (overlay) {
            overlay.remove();
          }
          container.remove();
          chrome.runtime.sendMessage({ action: 'resetChatContext' });
        });

        // Drag functionality with temporary listeners that are removed after each drag
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        function onMouseMove(e) {
          if (!isDragging) return;
          container.style.left = (e.clientX - dragOffsetX) + 'px';
          container.style.top = (e.clientY - dragOffsetY) + 'px';
          container.style.right = 'auto';
        }

        function onMouseUp() {
          isDragging = false;
          header.style.cursor = 'move';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }

        header.addEventListener('mousedown', (e) => {
          isDragging = true;
          dragOffsetX = e.clientX - container.offsetLeft;
          dragOffsetY = e.clientY - container.offsetTop;
          header.style.cursor = 'grabbing';
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
        });

        // Messages container
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'gpt-helper-messages';
        messagesContainer.style.flex = '1';
        messagesContainer.style.overflowY = 'auto';
        messagesContainer.style.padding = '20px';
        messagesContainer.style.display = 'flex';
        messagesContainer.style.flexDirection = 'column';
        messagesContainer.style.gap = '16px';

        // Add initial messages if provided
        function addMessage(content, isUser = false) {
          const messageDiv = document.createElement('div');
          messageDiv.className = `gpt-helper-message ${isUser ? 'user' : 'assistant'}`;

          const bubble = document.createElement('div');
          bubble.className = 'gpt-helper-bubble';
          bubble.innerHTML = content;

          // timestamp
          const timestamp = document.createElement('div');
          timestamp.className = 'gpt-helper-timestamp';
          timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          messageDiv.appendChild(bubble);
          messageDiv.appendChild(timestamp);
          messagesContainer.appendChild(messageDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          return messageDiv;
        }

        if (params.initialMessage) {
          addMessage(params.initialMessage, true);
          if (params.initialResponse) {
            addMessage(params.initialResponse, false);
          } else {
            // Typing indicator
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'gpt-helper-message assistant typing';
            const typingBubble = document.createElement('div');
            typingBubble.className = 'gpt-helper-bubble';
            typingBubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            typingIndicator.appendChild(typingBubble);
            messagesContainer.appendChild(typingIndicator);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }

        // Input container
        const inputContainer = document.createElement('div');
        inputContainer.className = 'gpt-helper-actions';

        const textarea = document.createElement('textarea');
        textarea.className = 'gpt-helper-textarea';
        textarea.placeholder = params.i18n.chatPlaceholder;
        textarea.rows = 1;

        const copyButton = document.createElement('button');
        copyButton.className = 'gpt-helper-button copy';
        copyButton.innerHTML = '📋';

        inputContainer.appendChild(textarea);
        inputContainer.appendChild(copyButton);

        // Send message logic
        async function sendMessage() {
          const message = textarea.value.trim();
          if (!message) return;

          addMessage(message, true);
          textarea.value = '';
          textarea.style.height = 'auto';

          // Typing indicator
          const typingIndicator = document.createElement('div');
          typingIndicator.className = 'gpt-helper-message assistant typing';
          const typingBubble = document.createElement('div');
          typingBubble.className = 'gpt-helper-bubble';
          typingBubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
          typingIndicator.appendChild(typingBubble);
          messagesContainer.appendChild(typingIndicator);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;

          try {
            const response = await chrome.runtime.sendMessage({
              action: 'chat',
              message: message,
              context: {
                originalText: params.initialMessage || '',
                resultText: params.initialResponse || ''
              }
            });

            typingIndicator.remove();
            addMessage(response.message);
          } catch (error) {
            typingIndicator.remove();
            addMessage('Error: ' + (error.message || 'Failed to process message'), false);
          }
        }

        textarea.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        textarea.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });

        copyButton.addEventListener('click', function() {
          const messages = document.querySelectorAll('.gpt-helper-message.assistant .gpt-helper-bubble');
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1].textContent;
            navigator.clipboard.writeText(lastMessage)
              .then(() => {
                this.innerHTML = '✓';
                // Success message
                const successMessage = document.createElement('div');
                successMessage.style.position = 'absolute';
                successMessage.style.right = '50px';
                successMessage.style.bottom = '20px';
                successMessage.style.backgroundColor = '#4CAF50';
                successMessage.style.color = 'white';
                successMessage.style.padding = '8px 16px';
                successMessage.style.borderRadius = '4px';
                successMessage.style.fontSize = '14px';
                successMessage.textContent = 'Copiato!';
                inputContainer.appendChild(successMessage);

                setTimeout(() => {
                  if (overlay) {
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                  }
                  container.remove();
                }, 500);
              })
              .catch(err => {
                alert(params.i18n.errorCopying);
              });
          }
        });

        // Ensure styles are scoped to our container
        const style = document.createElement('style');
        style.textContent = `
          .gpt-helper-result {
            all: initial;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          .gpt-helper-result * {
            box-sizing: border-box;
            font-family: inherit;
            /* avoid resetting user-select or pointer-events here */
          }
        `;
        document.head.appendChild(style);

        // Assemble and add to page
        container.appendChild(header);
        container.appendChild(messagesContainer);
        container.appendChild(inputContainer);

        document.body.appendChild(container);
        textarea.focus();
      },
      args: [{
        overlayEnabled,
        initialMessage: initialMessage,
        initialResponse: initialResponse,
        currentModel: currentModel,
        i18n: {
          chatPlaceholder: chrome.i18n.getMessage('chatPlaceholder'),
          errorCopying: chrome.i18n.getMessage('errorCopying')
        }
      }]
    });
  } catch (error) {
    showAlert(tab, `Error showing chat window: ${error.message}`);
  }
}

// Handle chat context reset
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'resetChatContext') {
    chrome.storage.local.remove('chatHistory');
  }
});