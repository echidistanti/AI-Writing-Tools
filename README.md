# AI Writing Tools

## Simplified Writing Assistance

AI Writing Tools is a Chrome extension that offers straightforward support for writing. Designed for ease of use, this extension provides helpful text analysis and suggestions directly within your browser.

To install the extension, download the project and load it as an unpacked extension in Chrome by enabling Developer Mode and selecting the project folder. Configure your API endpoint, API key, and custom prompts via the settings page once installed.

To use AI Writing Tools, simply select text on any webpage and access the extension through the context menu. The extension will analyze the text and display the results directly in your browser.

## 🌟 Key Features

- **Custom Text Processing**: Create and manage custom prompts to process selected text in any way you need
- **Contextual Menu Integration**: Right-click on any selected text to access your custom prompts
- **Interactive Chat**: Engage in a conversation about the processed text with the AI assistant
- **Settings Management**: Export and import your settings and prompts for backup or sharing

## 🚀 Getting Started

### Prerequisites
- Google Chrome browser
- API key for your chosen provider (OpenAI, Gemini via OpenAI-compatible proxy, Claude, etc.)

### Installation
1. Clone this repository or download the source code
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

### Configuration
1. Click the extension icon in your browser toolbar
2. Open the settings page
3. Configure your AI provider:
   - Enter the API endpoint URL (must be OpenAI-compatible, e.g. `https://api.openai.com`)
   - Enter your API key
   - The available models will be automatically loaded
4. Create your custom prompts

> **Note:** For Gemini or Claude, you must use an OpenAI-compatible proxy endpoint. The official Gemini API is **not** directly compatible.

## 💡 Usage

1. **Process Text**:
   - Select any text on a webpage
   - Right-click to open the context menu
   - Choose one of your custom prompts or use "Prompt on the Fly"
   - View the processed result in the floating window

2. **Chat with AI**:
   - After processing text, click the "Chat" button
   - Ask questions or request modifications about the original or processed text
   - Get instant AI-powered responses

3. **Manage Prompts**:
   - Open the settings page
   - Add, edit, or delete custom prompts
   - Drag and drop to reorder prompts
   - Export/Import settings for backup

## ⚙️ Features in Detail

### AI Provider Configuration
- Support for multiple AI providers using OpenAI-compatible API format
- Compatible with:
  - OpenAI
  - Gemini (via OpenAI-compatible proxy)
  - Anthropic Claude (via OpenAI-compatible proxy)
  - Other OpenAI-compatible endpoints
- Automatic model detection based on provider's API
- Secure API key and endpoint storage

### Custom Prompts
Create prompts for various purposes:
- Text summarization
- Language translation
- Grammar correction
- Style transformation
- Code explanation
- And more...

### Window Controls
- Drag the window by its header
- Resize from the bottom-right corner
- Copy results with one click
- Close with the ✖ button

### Settings Management
- Secure API key storage
- Model selection
- Prompt management
- Import/Export functionality

## 🔒 Privacy & Security

- Your API credentials are stored securely in Chrome's storage
- All processing is done through your configured AI provider
- No data is stored on external servers
- Settings can be exported/imported locally

## 🤝 Contributing

Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.
