console.log('GPT Writing Tools loaded');

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action === 'analyze_text') {
            const selectedText = window.getSelection().toString();
            if (!selectedText) {
                throw new Error('No text selected');
            }
            sendResponse({ success: true, text: selectedText });
        }
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
    return true;
});

// Funzione per verificare il dark mode
function isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Funzione per applicare il dark mode
function applyDarkMode(element) {
    if (isDarkMode()) {
        element.classList.add('dark-mode');
    } else {
        element.classList.remove('dark-mode');
    }
}

// Observer per il dark mode
const darkModeObserver = window.matchMedia('(prefers-color-scheme: dark)');
darkModeObserver.addListener((e) => {
    const floatingWindow = document.querySelector('.gpt-helper-result');
    if (floatingWindow) {
        applyDarkMode(floatingWindow);
    }
});

// Add context menu for selected text
document.addEventListener('mouseup', () => {
    try {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            chrome.runtime.sendMessage({
                action: 'text_selected',
                text: selectedText,
                url: window.location.href,
                darkMode: isDarkMode()
            }).catch(console.error);
        }
    } catch (error) {
        console.error('Selection error:', error);
    }
});

// Aggiungi l'observer per nuovi elementi aggiunti
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.classList && node.classList.contains('gpt-helper-result')) {
                applyDarkMode(node);
            }
        });
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});
