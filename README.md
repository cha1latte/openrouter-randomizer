# OpenRouter Randomizer

A SillyTavern extension that automatically randomizes OpenRouter AI models for each message generation to help avoid repetitive patterns and phrases.

## Features

- **Automatic Model Randomization**: Randomly selects from your chosen models for each generation
- **Smart Model Selection**: Choose specific models or let it use all available models as fallback
- **Search & Filter**: Easily find and select models with search functionality
- **Model Information Display**: Shows context length and pricing information for each model
- **Auto-Retry Logic**: Automatically tries alternative models if one fails
- **Silent Operation**: Works transparently without notifications
- **Visual Enhancements**: Clean UI with cost-based highlighting and smooth interactions

## Installation

1. Download or clone this repository
2. Copy the `openrouter-randomizer` folder to your SillyTavern extensions directory:
   ```
   SillyTavern/public/scripts/extensions/openrouter-randomizer/
   ```
3. Restart SillyTavern
4. Enable the extension in the Extensions tab
5. Configure your OpenRouter API key in SillyTavern's API Connections settings

## Usage

1. **Enable the Extension**: Check "Enable OpenRouter Model Randomizer" in the extension settings
2. **Select Models**: The extension will automatically fetch available models. Use the search box to filter and select your preferred models
3. **Start Chatting**: The extension will automatically randomize between your selected models for each message

## How It Works

The extension uses API request interception to modify the model parameter in real-time, ensuring:
- No interference with SillyTavern's connection state
- Seamless integration with existing workflows
- Automatic fallback to alternative models if one fails
- Preservation of all other chat settings

## Model Selection

- **Search Functionality**: Use the search box to quickly find models (e.g., "gpt-4", "claude", "mistral")
- **Select All/Deselect All**: Bulk selection tools for easy management
- **Visual Indicators**: 
  - **Free models** are highlighted in green
  - **Expensive models** are highlighted in red
  - **Budget-friendly models** are highlighted in blue
- **Cost Information**: Each model shows tokens per dollar for easy comparison

## Requirements

- SillyTavern
- Valid OpenRouter API key
- Active OpenRouter connection

## File Structure

```
openrouter-randomizer/
├── index.js          # Main extension logic
├── settings.html     # UI template
├── style.css         # Styling and visual enhancements
├── manifest.json     # Extension metadata
└── README.md         # This file
```

## Troubleshooting

- **Models not loading**: Ensure your OpenRouter API key is configured in SillyTavern's API Connections
- **Randomization not working**: Check that the extension is enabled and at least one model is selected
- **Connection issues**: The extension preserves your OpenRouter connection - if you're disconnected, it's likely an API key or network issue

## Contributing

Feel free to submit issues or pull requests to improve the extension!

## License

MIT License - Feel free to modify and distribute.