// Configuration
const CONFIG = {
  MAX_TOKENS: 4000,
  TOKEN_RATIO: 4,
};

// Extension state
let state = {
  apiKey: '',
  apiEndpoint: '',
  selectedModel: '',
  availableModels: [],
  prompts: []
};

// Load configuration
async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get([
      'apiKey', 
      'apiEndpoint',
      'selectedModel', 
      'availableModels',
      'customPrompts'
    ]);
    
    state = {
      apiKey: result.apiKey || '',
      apiEndpoint: result.apiEndpoint || '',
      selectedModel: result.selectedModel || '',
      availableModels: Array.isArray(result.availableModels) ? result.availableModels : [],
      prompts: Array.isArray(result.customPrompts) ? result.customPrompts : []
    };
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
}

// Create context menus
function createContextMenus() {
  console.log('Creating context menus with prompts:', state.prompts);
  
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
  console.log('Extension installed/updated');
  await loadConfig();
  createContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started');
  await loadConfig();
  createContextMenus();
});

// Handle storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  console.log('Storage changed:', changes, area);
  if (area === 'sync') {
    if (changes.apiKey) state.apiKey = changes.apiKey.newValue;
    if (changes.selectedModel) state.selectedModel = changes.selectedModel.newValue;
    if (changes.customPrompts) {
      state.prompts = changes.customPrompts.newValue;
      createContextMenus();
    }
  }
});

// Handle messages from other parts of the extension
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'reloadConfig') {
    console.log('Reloading configuration...');
    await loadConfig();
    createContextMenus();
    sendResponse({ success: true });
  }
  return true;
});

// Keep alive mechanism
setInterval(() => {
  chrome.runtime.getPlatformInfo(() => {});
}, 20000);

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
  let base = apiEndpoint.trim().replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

// Process text with the configured API
async function processText(text, promptText, tab) {
  await loadConfig();
  if (!validateInput(text, tab)) return;

  try {
    // Mostra subito la chat window con il prompt e senza risposta
    await showChatWindow(tab, `${promptText}\n\n${text}`, null);

    const url = buildChatCompletionsUrl(state.apiEndpoint);
    console.log('Making API request to:', url);

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
      console.error('API Error:', {
        status: response.status,
        url,
        error: errorBody
      });
      throw new Error(`API request failed (${response.status}): ${errorBody}`);
    }

    const result = await response.json();
    const generatedText = result.choices[0].message.content;

    // Aggiorna la finestra con la risposta dell'AI
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (responseText) => {
        const container = document.querySelector('.gpt-helper-result');
        if (!container) return;
        const messagesContainer = container.querySelector('.gpt-helper-messages');
        // Rimuovi eventuale typing indicator
        const typing = messagesContainer.querySelector('.gpt-helper-message.assistant.typing');
        if (typing) typing.remove();
        // Aggiungi la risposta dell'AI
        function addMessage(content, isUser = false) {
          const messageDiv = document.createElement('div');
          messageDiv.className = `gpt-helper-message ${isUser ? 'user' : 'assistant'}`;
          const bubble = document.createElement('div');
          bubble.className = 'gpt-helper-bubble';
          bubble.innerHTML = content;
          Object.assign(bubble.style, {
            padding: '12px 16px',
            borderRadius: isUser
              ? '18px 18px 4px 18px'   // User: angolo in basso a sinistra più squadrato
              : '18px 18px 18px 4px', // Assistant: angolo in basso a destra più squadrato
            backgroundColor: isUser
              ? 'var(--gpt-user-bubble-bg)'
              : 'var(--gpt-bubble-bg)',
            color: isUser
              ? 'var(--gpt-user-bubble-text)'
              : 'var(--gpt-bubble-text)',
            fontSize: '14px',
            lineHeight: '1.5',
            wordBreak: 'break-word',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
            position: 'relative',
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            maxWidth: '100%', // Limita la larghezza della bolla
            minWidth: '40px',
            display: 'inline-block',
            whiteSpace: 'pre-line'
          });
          messageDiv.appendChild(bubble);
          // timestamp opzionale
          messagesContainer.appendChild(messageDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        addMessage(responseText, false);
      },
      args: [generatedText]
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
  // Instead of opening options page, show chat window
  await showChatWindow(tab, '', '');
});

// Show loading window
async function showLoadingWindow(tab) {
  // The loading state will be handled within the chat window
  return;
}

// Show result
async function showResult(originalText, resultText, tab) {
  // Non fare nulla qui, la risposta è già stata mostrata
  return;
}

// Rimuovi il vecchio listener e sostituiscilo con questo
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
          console.error('Chat API Error:', {
            status: response.status,
            url,
            error: errorBody
          });
          throw new Error(`API request failed (${response.status}): ${errorBody}`);
        }

        const result = await response.json();
        const assistantMessage = result.choices[0].message.content;

        // Update chat history
        chatHistory.push(
          { role: 'user', content: request.message },
          { role: 'assistant', content: assistantMessage }
        );

        // Keep only last 10 pairs of messages
        if (chatHistory.length > 20) {
          chatHistory.splice(0, 2);
        }

        await chrome.storage.local.set({ chatHistory });
        sendResponse({ message: assistantMessage });
      } catch (error) {
        console.error('Chat error:', error);
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

    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['styles/result.css']
    });

    const { overlayEnabled = true } = await chrome.storage.local.get(['overlayEnabled']);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (params) => {
        // Remove any previous container
        let container = document.querySelector('.gpt-helper-result');
        if (container) container.remove();

        // Remove any overlay
        document.querySelectorAll('.gpt-helper-overlay').forEach(el => el.remove());

        // Create overlay if enabled
        let overlay = null;
        if (params.overlayEnabled) {
          overlay = document.createElement('div');
          overlay.className = 'gpt-helper-overlay';
          document.body.appendChild(overlay);
          overlay.offsetHeight; // Force reflow
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
          // Notifica il background che la finestra è stata chiusa
          chrome.runtime.sendMessage({ action: 'resetChatContext' });
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
    console.error('Error showing chat window:', error);
    showAlert(tab, `Error showing chat window: ${error.message}`);
  }
}

// Listener per resettare il contesto chat quando la finestra viene chiusa
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'resetChatContext') {
    chrome.storage.local.remove('chatHistory');
    return;
  }
});