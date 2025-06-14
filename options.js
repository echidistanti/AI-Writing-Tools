// Stato globale minimo per esempio
const State = {
    prompts: [],
    hasUnsavedChanges: false
};

// Funzione per aggiornare la tabella dei prompt (dummy)
function updatePromptsTable() {
    const tbody = document.querySelector('#promptsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    State.prompts.forEach((prompt, idx) => {
        const tr = document.createElement('tr');

        // Nome (input)
        const tdName = document.createElement('td');
        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.value = prompt.name || '';
        inputName.className = 'prompt-name-input';
        inputName.addEventListener('input', (e) => {
            State.prompts[idx].name = e.target.value;
            State.hasUnsavedChanges = true;
            updateSaveButtonState();
        });
        tdName.appendChild(inputName);
        tr.appendChild(tdName);

        // Prompt (input)
        const tdPrompt = document.createElement('td');
        const inputPrompt = document.createElement('input');
        inputPrompt.type = 'text';
        inputPrompt.value = prompt.prompt || '';
        inputPrompt.className = 'prompt-text-input';
        inputPrompt.addEventListener('input', (e) => {
            State.prompts[idx].prompt = e.target.value;
            State.hasUnsavedChanges = true;
            updateSaveButtonState();
        });
        tdPrompt.appendChild(inputPrompt);
        tr.appendChild(tdPrompt);

        // Azioni
        const tdActions = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'button delete';
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete the prompt "${prompt.name}"?`)) {
                State.prompts.splice(idx, 1);
                State.hasUnsavedChanges = true;
                updatePromptsTable();
                updateSaveButtonState();
            }
        });
        tdActions.appendChild(deleteBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });
}

// Funzione per aggiornare lo stato del pulsante save
function updateSaveButtonState() {
    const saveButton = document.getElementById('savePrompts');
    if (saveButton) {
        saveButton.disabled = !State.hasUnsavedChanges;
        saveButton.style.opacity = State.hasUnsavedChanges ? '1' : '0.5';
    }
}

// Funzione per mostrare lo stato del salvataggio
function showSaveStatus(message) {
    const status = document.getElementById('saveStatus');
    if (status) {
        status.textContent = message;
        status.style.display = 'inline';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    }
}

// Funzione per aggiungere un prompt (dummy)
function addNewPrompt() {
    State.prompts.push({ id: Date.now(), name: "New Prompt", prompt: "" });
    State.hasUnsavedChanges = true;
    updatePromptsTable();
    updateSaveButtonState();
}

// Funzione per esportare le impostazioni
async function exportSettings() {
    const settings = {
        apiEndpoint: document.getElementById('apiEndpoint').value,
        apiKey: document.getElementById('apiKey').value,
        selectedModel: document.getElementById('selectedModel').value,
        temperature: parseFloat(document.getElementById('temperature').value) || 1,
        customPrompts: State.prompts
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-writing-tools-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Funzione per importare le impostazioni
async function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const settings = JSON.parse(text);
        if (settings.apiEndpoint) document.getElementById('apiEndpoint').value = settings.apiEndpoint;
        if (settings.apiKey) document.getElementById('apiKey').value = settings.apiKey;
        if (settings.selectedModel) document.getElementById('selectedModel').value = settings.selectedModel;
        if (settings.temperature !== undefined) document.getElementById('temperature').value = settings.temperature;
        if (Array.isArray(settings.customPrompts)) {
            State.prompts = settings.customPrompts;
            updatePromptsTable();
        }
        State.hasUnsavedChanges = true;
        updateSaveButtonState();
        showSaveStatus('Settings imported successfully');
        // Salva subito su chrome.storage.sync
        await saveAllSettings();
    } catch (error) {
        alert('Import failed: ' + error.message);
    }
    event.target.value = '';
}

// Funzione per salvare tutte le impostazioni
async function saveAllSettings() {
    try {
        await chrome.storage.sync.set({
            apiEndpoint: document.getElementById('apiEndpoint').value,
            apiKey: document.getElementById('apiKey').value,
            selectedModel: document.getElementById('selectedModel').value,
            temperature: parseFloat(document.getElementById('temperature').value) || 1,
            customPrompts: State.prompts
        });
        State.hasUnsavedChanges = false;
        updateSaveButtonState();
        showSaveStatus('✅ Settings saved successfully');
    } catch (error) {
        showSaveStatus('❌ Error saving settings');
        console.error(error);
    }
}

// Funzione per testare la connessione
async function testConnection() {
    const statusElement = document.getElementById('connectionStatus');
    try {
        statusElement.textContent = '🔄 Testing connection...';
        statusElement.style.display = 'block';
        statusElement.className = 'connection-status';
        const endpoint = document.getElementById('apiEndpoint').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        const model = document.getElementById('selectedModel').value.trim();
        if (!endpoint || !apiKey || !model) throw new Error('Please fill in all fields');
        const normalizedEndpoint = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
        const response = await fetch(`${normalizedEndpoint}chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: "test" }],
                max_tokens: 1
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`API Error (${response.status}): ${data.error?.message || 'Unknown error'}`);
        statusElement.textContent = '✅ Connection successful!';
        statusElement.className = 'connection-status success';
    } catch (error) {
        statusElement.textContent = `❌ Error: ${error.message}`;
        statusElement.className = 'connection-status error';
    }
}

// Funzione per caricare le impostazioni
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get([
            'apiEndpoint',
            'apiKey',
            'selectedModel',
            'temperature',
            'customPrompts'
        ]);
        // Aggiorna i campi input
        if (result.apiEndpoint) document.getElementById('apiEndpoint').value = result.apiEndpoint;
        if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
        if (result.selectedModel) document.getElementById('selectedModel').value = result.selectedModel;
        if (result.temperature !== undefined) document.getElementById('temperature').value = result.temperature;
        else document.getElementById('temperature').value = 1;
        // Aggiorna i prompt
        State.prompts = Array.isArray(result.customPrompts) ? result.customPrompts : [];
        updatePromptsTable();
        State.hasUnsavedChanges = false;
        updateSaveButtonState();
    } catch (error) {
        console.error('Errore nel caricamento delle impostazioni:', error);
    }
}

// Tab switching logic
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    setupEventListeners();
    // Tab logic
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(this.dataset.tab).classList.add('active');
        });
    });
});

// Setup degli event listener
function setupEventListeners() {
    document.getElementById('checkConnection')?.addEventListener('click', testConnection);
    document.getElementById('addPrompt')?.addEventListener('click', addNewPrompt);
    document.getElementById('savePrompts')?.addEventListener('click', saveAllSettings);
    document.getElementById('exportSettings')?.addEventListener('click', exportSettings);
    document.getElementById('importSettings')?.addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile')?.addEventListener('change', importSettings);

    // Cambiamenti nei campi input
    ['apiEndpoint', 'apiKey', 'selectedModel', 'temperature'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            State.hasUnsavedChanges = true;
            updateSaveButtonState();
        });
    });
}

// Inizializzazione
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    setupEventListeners();
    // updateSaveButtonState(); // già chiamato in loadSettings
    // updatePromptsTable();    // già chiamato in loadSettings
});

// Confirm before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (State.hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});