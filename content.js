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
