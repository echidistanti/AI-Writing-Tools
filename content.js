// Monitor dark mode changes
const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
darkModeMediaQuery.addListener((e) => {
    const floatingWindow = document.querySelector('.gpt-helper-result');
    if (floatingWindow) {
        floatingWindow.classList.toggle('dark-mode', e.matches);
    }
});

// Add event listener for selected text
document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        chrome.runtime.sendMessage({
            action: 'text_selected',
            text: selectedText,
            url: window.location.href
        }).catch(() => { /* Ignore errors */ });
    }
});

// allow background to append response messages without reinjecting code
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'appendChatResponse') {
        const responseText = msg.responseText;
        const container = document.querySelector('.gpt-helper-result');
        if (!container) return;
        const messagesContainer = container.querySelector('.gpt-helper-messages');
        // remove typing indicator if present
        const typing = messagesContainer.querySelector('.gpt-helper-message.assistant.typing');
        if (typing) typing.remove();
        // add message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'gpt-helper-message assistant';
        const bubble = document.createElement('div');
        bubble.className = 'gpt-helper-bubble';
        bubble.innerHTML = responseText;
        messageDiv.appendChild(bubble);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});
