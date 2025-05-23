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
  // Rimuovi slash finale e /v1 finale se presenti
  let base = apiEndpoint.trim().replace(/\/+$/, '');
  base = base.replace(/\/v1$/, '');
  return `${base}/v1/chat/completions`;
}

// Process text with the configured API
async function processText(text, promptText, tab) {
  await loadConfig();
  if (!validateInput(text, tab)) return;

  try {
    await showLoadingWindow(tab);

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

    // Mostra la risposta nella floating window
    await showChatWindow(tab, `${promptText}\n\n${text}`, generatedText);

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
  // Open options page instead of chat window
  chrome.runtime.openOptionsPage();
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
        // Ensure styles are scoped to our container
        const style = document.createElement('style');
        style.textContent = `
          .gpt-helper-result, .gpt-helper-result * {
            all: initial;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
        `;
        document.head.appendChild(style);

        // Get existing window if any
        let container = document.querySelector('.gpt-helper-result');
        
        // Se la finestra esiste già, aggiungi i nuovi messaggi
        if (container) {
          const messagesContainer = container.querySelector('.gpt-helper-messages');
          // Funzione per aggiungere un messaggio (deve essere duplicata qui se non già globale)
          function addMessage(content, isUser = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `gpt-helper-message ${isUser ? 'user' : 'assistant'}`;
            // ...stili come già presenti...
            const bubble = document.createElement('div');
            bubble.className = 'gpt-helper-bubble';
            bubble.innerHTML = content;
            // ...stili come già presenti...
            messageDiv.appendChild(bubble);
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            return messageDiv;
          }
          // Aggiungi i nuovi messaggi se forniti
          if (params.initialMessage) addMessage(params.initialMessage, true);
          if (params.initialResponse) addMessage(params.initialResponse, false);
          return;
        }

        // Clean up any overlay
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

        // Create main container
        container = document.createElement('div');
        container.className = 'gpt-helper-result';

        // Fixed dimensions and position
        const width = 400;
        const height = 600;
        const padding = 20;

        Object.assign(container.style, {
          position: 'fixed',
          top: `${padding}px`,
          right: `${padding}px`,
          width: `${width}px`,
          height: `${height}px`,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--gpt-bg-color)',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          zIndex: '2147483647',
          opacity: '1',
          transform: 'none'
        });

        // Create header
        const header = document.createElement('div');
        Object.assign(header.style, {
          padding: '16px',
          borderBottom: '1px solid var(--gpt-border-color)',
          backgroundColor: 'var(--gpt-bg-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        });

        // Add title
        const title = document.createElement('div');
        title.textContent = 'GPT Chat';
        Object.assign(title.style, {
          fontWeight: '600',
          fontSize: '14px',
          color: 'var(--gpt-text-color)'
        });

        // Add model name (now using params.currentModel)
        const modelName = document.createElement('div');
        modelName.textContent = `Model: ${params.currentModel}`;
        Object.assign(modelName.style, {
          fontSize: '10px',
          color: '#999',
          marginLeft: '8px'
        });
        title.appendChild(modelName);

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '✕';
        Object.assign(closeButton.style, {
          border: 'none',
          background: 'none',
          color: '#999',
          fontSize: '16px',
          cursor: 'pointer',
          padding: '4px 8px'
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        // Close button handler
        closeButton.addEventListener('click', () => {
          if (overlay) {
            overlay.remove();
          }
          container.remove();
        });

        // Create messages container
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'gpt-helper-messages';
        Object.assign(messagesContainer.style, {
          flex: '1',
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          backgroundColor: 'var(--gpt-bg-color)'
        });

        // Function to add a message
        function addMessage(content, isUser = false) {
          const messageDiv = document.createElement('div');
          messageDiv.className = `gpt-helper-message ${isUser ? 'user' : 'assistant'}`;
          Object.assign(messageDiv.style, {
            maxWidth: '85%',
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          });

          const bubble = document.createElement('div');
          bubble.className = 'gpt-helper-bubble';
          bubble.innerHTML = content;
          Object.assign(bubble.style, {
            padding: '12px 16px',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            backgroundColor: isUser ? 'var(--gpt-user-bubble-bg)' : 'var(--gpt-bubble-bg)',
            color: 'var(--gpt-bubble-text)',
            fontSize: '14px',
            lineHeight: '1.5',
            wordBreak: 'break-word',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
            position: 'relative'
          });

          // Add time stamp
          const timestamp = document.createElement('div');
          timestamp.className = 'gpt-helper-timestamp';
          timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          Object.assign(timestamp.style, {
            fontSize: '11px',
            color: '#999',
            marginLeft: isUser ? 'auto' : '4px',
            marginRight: isUser ? '4px' : 'auto'
          });

          messageDiv.appendChild(bubble);
          messageDiv.appendChild(timestamp);
          messagesContainer.appendChild(messageDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          return messageDiv;
        }

        // Add initial messages if provided
        if (params.initialMessage) {
          addMessage(params.initialMessage, true);
          if (params.initialResponse) {
            addMessage(params.initialResponse, false);
          }
        }

        // Create input container
        const inputContainer = document.createElement('div');
        inputContainer.className = 'gpt-helper-input-container';
        Object.assign(inputContainer.style, {
          padding: '16px',
          borderTop: '1px solid var(--gpt-border-color)',
          display: 'flex',
          gap: '12px',
          backgroundColor: 'var(--gpt-bg-color)'
        });

        const textarea = document.createElement('textarea');
        textarea.className = 'gpt-helper-textarea';
        textarea.placeholder = params.i18n.chatPlaceholder;
        textarea.rows = 1;
        Object.assign(textarea.style, {
          flex: '1',
          border: '1px solid var(--gpt-border-color)',
          borderRadius: '24px',
          padding: '12px 16px',
          resize: 'none',
          fontSize: '14px',
          lineHeight: '1.5',
          fontFamily: 'inherit',
          backgroundColor: 'var(--gpt-input-bg)',
          color: 'var(--gpt-input-text)',
          outline: 'none'
        });

        // Add hover and focus styles for textarea
        textarea.addEventListener('mouseover', () => {
          textarea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        });

        textarea.addEventListener('mouseout', () => {
          if (document.activeElement !== textarea) {
            textarea.style.borderColor = 'var(--gpt-border-color)';
          }
        });

        textarea.addEventListener('focus', () => {
          textarea.style.borderColor = 'var(--gpt-primary-color)';
        });

        textarea.addEventListener('blur', () => {
          textarea.style.borderColor = 'var(--gpt-border-color)';
        });

        const copyButton = document.createElement('button');
        copyButton.className = 'gpt-helper-button copy';
        copyButton.innerHTML = '📋';
        Object.assign(copyButton.style, {
          border: 'none',
          background: 'none',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '8px',
          color: '#999'
        });

        inputContainer.appendChild(textarea);
        inputContainer.appendChild(copyButton);

        // Handle message sending
        async function sendMessage() {
          const message = textarea.value.trim();
          if (!message) return;

          addMessage(message, true);
          textarea.value = '';
          textarea.style.height = 'auto';

          // Show typing indicator
          const typingIndicator = document.createElement('div');
          typingIndicator.className = 'gpt-helper-message assistant typing';
          Object.assign(typingIndicator.style, {
            maxWidth: '80%',
            alignSelf: 'flex-start'
          });

          const typingBubble = document.createElement('div');
          typingBubble.className = 'gpt-helper-bubble';
          typingBubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
          Object.assign(typingBubble.style, {
            padding: '12px 16px',
            borderRadius: '18px 18px 18px 4px',
            backgroundColor: 'var(--gpt-bubble-bg)',
            display: 'inline-flex',
            gap: '4px',
            alignItems: 'center'
          });

          // Add dot animation styles
          const dots = typingBubble.querySelectorAll('.dot');
          dots.forEach((dot, index) => {
            Object.assign(dot.style, {
              width: '6px',
              height: '6px',
              backgroundColor: 'var(--gpt-bubble-text)',
              borderRadius: '50%',
              animation: `dotPulse 1s infinite ${index * 0.2}s`
            });
          });

          // Add animation keyframes
          const style = document.createElement('style');
          style.textContent = `
            @keyframes dotPulse {
              0%, 100% { transform: scale(1); opacity: 0.4; }
              50% { transform: scale(1.2); opacity: 1; }
            }
          `;
          document.head.appendChild(style);

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

        // Setup event handlers
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
                // Add a success message
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
                
                // Close window after 500ms
                setTimeout(() => {
                  if (overlay) {
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                  }
                  container.remove();
                }, 500);
              })
              .catch(err => {
                console.error('Copy failed:', err);
                alert(params.i18n.errorCopying);
              });
          }
        });

        // Assemble and add to page
        container.appendChild(header);
        container.appendChild(messagesContainer);
        container.appendChild(inputContainer);

        // Add container to page
        document.body.appendChild(container);
        textarea.focus();
      },
      args: [{
        overlayEnabled,
        initialMessage: initialMessage,
        initialResponse: initialResponse,
        currentModel: currentModel, // Pass the model info through args
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