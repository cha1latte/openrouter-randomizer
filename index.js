// index.js  ── SillyTavern extension "openrouter-randomizer"
const MODULE_NAME = 'openrouter-randomizer';

(async () => {
    try {
        // Suppress all secret-related warnings globally
        const originalWarn = console.warn;
        const suppressedWarnings = [
            'allowKeysExposure',
            'Cannot fetch secrets',
            'config.yaml',
            'allowKeysExposure in config.yaml is set to true'
        ];
        
        console.warn = (...args) => {
            const message = args.join(' ');
            const shouldSuppress = suppressedWarnings.some(warning => message.includes(warning));
            if (!shouldSuppress) {
                originalWarn.apply(console, args);
            }
        };
        /* -------------------------------------------------------
           1.  Import extension API and secret management
           ------------------------------------------------------- */
        const { getContext } = await import('/scripts/extensions.js');
        const { findSecret, readSecretState, SECRET_KEYS } = await import('/scripts/secrets.js');
        const ctx = getContext();
        const {
            renderExtensionTemplate,
            extension_settings,
            saveSettingsDebounced,
            addStyleSheet
        } = ctx;

        /* -------------------------------------------------------
           2.  Initialize extension settings
           ------------------------------------------------------- */
        // Function to load settings from localStorage if SillyTavern settings aren't available
        function loadSettings() {
            // Try SillyTavern's extension_settings first
            if (extension_settings && extension_settings[MODULE_NAME]) {
                return extension_settings[MODULE_NAME];
            }
            if (window.extension_settings && window.extension_settings[MODULE_NAME]) {
                return window.extension_settings[MODULE_NAME];
            }
            
            // Fallback to localStorage
            try {
                const stored = localStorage.getItem(`${MODULE_NAME}_settings`);
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                console.error(`[${MODULE_NAME}] Error loading settings from localStorage:`, e);
                return {};
            }
        }
        
        // Function to save settings to localStorage
        function saveSettings(settings) {
            try {
                localStorage.setItem(`${MODULE_NAME}_settings`, JSON.stringify(settings));
            } catch (e) {
                console.error(`[${MODULE_NAME}] Error saving settings to localStorage:`, e);
            }
            
            // Also try to save to SillyTavern's settings if available
            if (extension_settings) {
                extension_settings[MODULE_NAME] = settings;
            }
            if (window.extension_settings) {
                window.extension_settings[MODULE_NAME] = settings;
            }
        }
        
        // Load saved settings
        const savedSettings = loadSettings();

        /* -------------------------------------------------------
           3.  Load and inject the template manually
           ------------------------------------------------------- */
        
        // Try multiple possible paths for the template
        const templatePaths = [
            '/scripts/extensions/openrouter-randomizer/settings.html',
            '/scripts/extensions/third-party/openrouter-randomizer/settings.html',
            './settings.html'
        ];
        
        let templateContent = '';
        let templateLoaded = false;
        
        for (const path of templatePaths) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    templateContent = await response.text();
                    templateLoaded = true;
                    break;
                }
            } catch (error) {
                // Continue to next path
            }
        }
        
        if (!templateLoaded) {
            console.error(`[${MODULE_NAME}] Could not load template from any path`);
            return;
        }
        
        // Function to try setting up the UI
        const trySetupUI = () => {
            const extensionsContainer = document.getElementById('extensions_settings');
            if (extensionsContainer) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = templateContent;
                
                const extensionDiv = tempDiv.querySelector('#openrouter-randomizer-settings');
                if (extensionDiv) {
                    extensionsContainer.appendChild(extensionDiv);
                    setupUI(extensionDiv);
                    return true;
                } else {
                    console.error(`[${MODULE_NAME}] Extension div not found in template`);
                }
            } else {
                console.error(`[${MODULE_NAME}] Extensions container not found, retrying...`);
                return false;
            }
            return false;
        };
        
        // Try to set up UI immediately
        if (!trySetupUI()) {
            // If it fails, retry a few times with delays
            let retryCount = 0;
            const maxRetries = 10;
            const retryInterval = setInterval(() => {
                retryCount++;
                if (trySetupUI() || retryCount >= maxRetries) {
                    clearInterval(retryInterval);
                    if (retryCount >= maxRetries) {
                        console.error(`[${MODULE_NAME}] Failed to set up UI after ${maxRetries} attempts`);
                    }
                }
            }, 500);
        }

        /* -------------------------------------------------------
           4.  Wire up the UI elements
           ------------------------------------------------------- */
        function setupUI(root) {
            // Load current settings
            let settings = loadSettings();

            // Wire up the main toggle checkbox
            const randomizeCheckbox = root.querySelector('#openrouter-randomizer-enabled');
            if (randomizeCheckbox) {
                randomizeCheckbox.checked = !!settings.randomizeModels;
                
                randomizeCheckbox.addEventListener('change', () => {
                    // Load fresh settings to ensure we have the latest state
                    const currentSettings = loadSettings();
                    currentSettings.randomizeModels = randomizeCheckbox.checked;
                    
                    console.log(`[${MODULE_NAME}] Randomizer toggle changed to:`, randomizeCheckbox.checked);
                    
                    // Save using our localStorage function
                    saveSettings(currentSettings);
                    
                    // Also try SillyTavern's saveSettingsDebounced if available
                    if (typeof saveSettingsDebounced === 'function') {
                        saveSettingsDebounced();
                    }
                    if (typeof window.saveSettingsDebounced === 'function') {
                        window.saveSettingsDebounced();
                    }
                    
                    // Update the local settings object for consistency
                    settings = currentSettings;
                });
            }

            // Wire up the notifications toggle checkbox
            const notificationsCheckbox = root.querySelector('#openrouter-randomizer-notifications');
            if (notificationsCheckbox) {
                // Default to enabled if not set
                notificationsCheckbox.checked = settings.showNotifications !== false;
                
                notificationsCheckbox.addEventListener('change', () => {
                    settings.showNotifications = notificationsCheckbox.checked;
                    
                    // Save using our localStorage function
                    saveSettings(settings);
                    
                    // Also try SillyTavern's saveSettingsDebounced if available
                    if (typeof saveSettingsDebounced === 'function') {
                        saveSettingsDebounced();
                    }
                    if (typeof window.saveSettingsDebounced === 'function') {
                        window.saveSettingsDebounced();
                    }
                });
            }

            // Function to fetch models from OpenRouter
            const fetchModels = async () => {
                // Try to get API key from SillyTavern's secret storage
                let apiKey = await getOpenRouterApiKey();
                
                // Fall back to user prompt if no key found
                if (!apiKey) {
                    apiKey = prompt("Please enter your OpenRouter API key or configure it in SillyTavern's API settings:");
                    if (!apiKey) {
                        alert("API key is required to fetch models.");
                        return;
                    }
                }

                // Call OpenRouter API to get list of models
                try {
                    const response = await fetch("https://openrouter.ai/api/v1/models", {
                        method: "GET",
                        headers: {
                            "Authorization": `Bearer ${apiKey}`
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const data = await response.json();
                    const models = data.data;
                    
                    // Store the model list in extension settings for reuse
                    settings.allModels = models;
                    if (saveSettingsDebounced) {
                        saveSettingsDebounced(MODULE_NAME, settings);
                    }
                    
                    // Now populate the UI with checkboxes for these models
                    populateModelCheckboxes(models, settings, root);
                    
                    // Show the select/deselect all buttons
                    const modelControls = root.querySelector('.model-controls');
                    if (modelControls) {
                        modelControls.style.display = 'block';
                    }
                } catch (error) {
                    console.error(`[${MODULE_NAME}] Failed to fetch models:`, error);
                    // Don't show alert for auto-fetch failures
                }
            };


            // Automatically fetch models when the extension loads
            fetchModels();
            

            // Wire up the search filter
            const searchInput = root.querySelector('#model-search');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const searchTerm = searchInput.value.toLowerCase().trim();
                    const container = root.querySelector('#model-list-container');
                    const modelItems = container.querySelectorAll('.model-item');
                    
                    modelItems.forEach(item => {
                        const label = item.querySelector('label span');
                        if (label) {
                            const modelName = label.textContent.toLowerCase();
                            const shouldShow = searchTerm === '' || modelName.includes(searchTerm);
                            item.style.display = shouldShow ? 'block' : 'none';
                        }
                    });
                });
            }

            // Wire up the select all button (only affects visible models)
            const selectAllBtn = root.querySelector('#select-all-btn');
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => {
                    const container = root.querySelector('#model-list-container');
                    const visibleItems = container.querySelectorAll('.model-item:not([style*="display: none"])');
                    
                    visibleItems.forEach(item => {
                        const checkbox = item.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            checkbox.checked = true;
                        }
                    });
                    
                    // Trigger change event to save selections
                    if (container.onchange) {
                        container.onchange();
                    }
                });
            }

            // Wire up the deselect all button (only affects visible models)
            const deselectAllBtn = root.querySelector('#deselect-all-btn');
            if (deselectAllBtn) {
                deselectAllBtn.addEventListener('click', () => {
                    const container = root.querySelector('#model-list-container');
                    const visibleItems = container.querySelectorAll('.model-item:not([style*="display: none"])');
                    
                    visibleItems.forEach(item => {
                        const checkbox = item.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            checkbox.checked = false;
                        }
                    });
                    
                    // Trigger change event to save selections
                    if (container.onchange) {
                        container.onchange();
                    }
                });
            }


            // Wire up the select favorites button
            const selectFavoritesBtn = root.querySelector('#select-favorites-btn');
            if (selectFavoritesBtn) {
                selectFavoritesBtn.addEventListener('click', () => {
                    const container = root.querySelector('#model-list-container');
                    const visibleItems = container.querySelectorAll('.model-item:not([style*="display: none"])');
                    const favorites = getFavorites();
                    
                    visibleItems.forEach(item => {
                        const checkbox = item.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            const modelId = checkbox.dataset.model;
                            checkbox.checked = favorites.includes(modelId);
                        }
                    });
                    
                    // Trigger change event to save selections
                    if (container.onchange) {
                        container.onchange();
                    }
                    
                    // Show notification
                    const favCount = favorites.length;
                    if (favCount > 0) {
                        showNotification(`Selected ${favCount} favorite model${favCount === 1 ? '' : 's'}`);
                    } else {
                        showNotification('No favorite models found. Star some models first!');
                    }
                });
            }



        }

        // Function to get OpenRouter API key from multiple sources
        async function getOpenRouterApiKey() {
            try {
                // Method 1: Try accessing from OpenRouter extension settings directly
                const openRouterSettings = window.extension_settings?.openrouter;
                if (openRouterSettings) {
                    // Try common property names for API key
                    const possibleKeys = ['api_key', 'apiKey', 'key', 'token', 'apiToken'];
                    for (const keyName of possibleKeys) {
                        if (openRouterSettings[keyName]) {
                            return openRouterSettings[keyName];
                        }
                    }
                }
                
                // Method 2: Try accessing from global extension settings
                const globalSettings = window.extension_settings;
                if (globalSettings) {
                    // Check for OpenRouter-related keys in global settings
                    const openRouterKeys = Object.keys(globalSettings).filter(key => 
                        key.toLowerCase().includes('openrouter') || 
                        key.toLowerCase().includes('open_router')
                    );
                    
                    for (const settingKey of openRouterKeys) {
                        const setting = globalSettings[settingKey];
                        if (setting && typeof setting === 'object') {
                            for (const keyName of ['api_key', 'apiKey', 'key', 'token', 'apiToken']) {
                                if (setting[keyName]) {
                                    return setting[keyName];
                                }
                            }
                        }
                    }
                }
                
                // Method 3: Try accessing from SillyTavern's secret storage
                try {
                    const secretsModule = await import('/scripts/secrets.js');
                    await readSecretState();
                    const currentSecretState = secretsModule.secret_state;
                    const openRouterSecrets = currentSecretState[SECRET_KEYS.OPENROUTER];
                    
                    if (openRouterSecrets && Array.isArray(openRouterSecrets)) {
                        const activeSecret = openRouterSecrets.find(secret => secret.active);
                        if (activeSecret) {
                            let apiKey = await findSecret(SECRET_KEYS.OPENROUTER, activeSecret.id);
                            if (!apiKey && activeSecret.value) {
                                apiKey = activeSecret.value;
                            }
                            if (apiKey) {
                                return apiKey;
                            }
                        }
                    }
                } catch (secretError) {
                    // Silent error handling for secret access
                }
                
                return null;
                
            } catch (error) {
                return null;
            }
        }

        // Storage helpers for selected models
        const KEY = 'orr_selected';
        function getSaved() {
            return JSON.parse(localStorage.getItem(KEY) || '[]');
        }
        function save(ids) {
            localStorage.setItem(KEY, JSON.stringify(ids));
        }

        // Storage helpers for favorite models
        const FAVORITES_KEY = 'orr_favorites';
        function getFavorites() {
            return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
        }
        function addFavorite(modelId) {
            const favorites = getFavorites();
            if (!favorites.includes(modelId)) {
                favorites.push(modelId);
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
            }
        }
        function removeFavorite(modelId) {
            const favorites = getFavorites();
            const index = favorites.indexOf(modelId);
            if (index > -1) {
                favorites.splice(index, 1);
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
            }
        }
        function isFavorite(modelId) {
            return getFavorites().includes(modelId);
        }

        // Helper function to show notifications if enabled
        function showNotification(message, title = 'OpenRouter Randomizer') {
            const settings = loadSettings();
            if (settings.showNotifications !== false && window.toastr) {
                window.toastr.info(message, title);
            }
        }


        // Core randomization function
        function getRandomModel() {
            const selectedModels = getSaved();
            if (selectedModels.length === 0) {
                console.warn(`[${MODULE_NAME}] No models selected for randomization`);
                return null;
            }
            
            const randomIndex = Math.floor(Math.random() * selectedModels.length);
            return selectedModels[randomIndex];
        }

        // Function to trigger randomization and update SillyTavern's model selection
        function triggerRandomization() {
            const settings = loadSettings();
            
            // Check if randomization is enabled
            console.log(`[${MODULE_NAME}] triggerRandomization() - randomizeModels:`, settings.randomizeModels);
            if (!settings.randomizeModels) {
                console.log(`[${MODULE_NAME}] triggerRandomization() - randomization disabled, returning`);
                return;
            }
            
            const randomModelId = getRandomModel();
            if (!randomModelId) {
                console.warn(`[${MODULE_NAME}] Cannot randomize: no models selected`);
                return;
            }
            
            // Update SillyTavern's OpenRouter model selection
            try {
                // Access SillyTavern's OpenRouter settings
                const openRouterSettings = window.extension_settings?.openrouter || {};
                const prevModel = openRouterSettings.model;
                
                // Set the new model
                openRouterSettings.model = randomModelId;
                
                // Save the settings
                if (window.saveSettingsDebounced) {
                    window.saveSettingsDebounced();
                }
                
                // Trigger UI update if available
                const modelSelect = document.querySelector('#openrouter_models');
                if (modelSelect) {
                    modelSelect.value = randomModelId;
                    modelSelect.dispatchEvent(new Event('change'));
                }
                
                console.log(`[${MODULE_NAME}] Model randomized: ${prevModel} → ${randomModelId}`);
                
                // Show toast notification if enabled
                showNotification(`Model randomized to: ${randomModelId}`);
                
            } catch (error) {
                console.error(`[${MODULE_NAME}] Error during randomization:`, error);
            }
        }

        // Register the generate interceptor with SillyTavern (defined in manifest.json)
        globalThis.openrouterRandomizerInterceptor = async function(chat, contextSize, abort, type) {
            try {
                // Load current settings using our localStorage function
                const settings = loadSettings();
                
                // Only intercept if randomization is enabled
                console.log(`[${MODULE_NAME}] generateInterceptor() - randomizeModels:`, settings.randomizeModels);
                if (!settings.randomizeModels) {
                    console.log(`[${MODULE_NAME}] generateInterceptor() - randomization disabled, returning`);
                    return;
                }
                
                // Get selected models from localStorage
                const chosen = JSON.parse(localStorage.getItem(KEY) || '[]');
                const pool = chosen.length ? chosen : JSON.parse(localStorage.getItem('orr_all')||'[]');
                
                if (!pool.length) {
                    return;
                }

                const pick = pool[Math.floor(Math.random() * pool.length)];
                
                // Store the randomized model for API interception
                window.openrouterRandomizerModel = pick;
                
                
            } catch (error) {
                // Silent error handling
            }
        };
        
        console.log(`[${MODULE_NAME}] Generate interceptor registered`);

        // Set up one-time fetch interceptor for API request modification
        if (!window.openrouterRandomizerFetchHooked) {
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                const url = args[0];
                let options = args[1];
                
                
                // Check for OpenRouter API calls (both direct and via SillyTavern proxy)
                if (typeof url === 'string' && 
                    (url.includes('openrouter.ai') || 
                     url.includes('/v1/chat/completions') ||
                     url.includes('/chat/completions') ||
                     url.includes('api.openai.com') ||
                     url.includes('/api/backends/chat-completions/generate'))) {
                    
                    // Get the current randomized model from our storage
                    const randomizedModel = window.openrouterRandomizerModel;
                    
                    if (randomizedModel) {
                        // Modify the request to use our randomized model
                        if (options && options.body) {
                            try {
                                const body = JSON.parse(options.body);
                                const originalModel = body.model;
                                
                                // Validate that the randomized model exists
                                if (!randomizedModel || randomizedModel.trim() === '') {
                                    return originalFetch.apply(this, args);
                                }
                                
                                body.model = randomizedModel;
                                options.body = JSON.stringify(body);
                                args[1] = options;
                                
                                // Show notification for the model change
                                showNotification(`Using model: ${randomizedModel}`);
                                
                                
                            } catch (e) {
                                // Return original request if modification fails
                                return originalFetch.apply(this, args);
                            }
                        }
                    }
                }
                
                // Call the original fetch with retry logic for failed models
                const fetchPromise = originalFetch.apply(this, args);
                
                // Add retry logic for failed requests
                return fetchPromise.catch(async (error) => {
                    // Only retry for chat completion requests that might be model-related failures
                    if (typeof url === 'string' && url.includes('/api/backends/chat-completions/generate')) {
                        // Get available models for retry
                        const chosenRaw = localStorage.getItem('orr_selected') || '[]';
                        const allRaw = localStorage.getItem('orr_all') || '[]';
                        const chosen = JSON.parse(chosenRaw);
                        const pool = chosen.length ? chosen : JSON.parse(allRaw);
                        
                        const failedModel = window.openrouterRandomizerModel;
                        
                        // Filter out the failed model and try others
                        const availableModels = pool.filter(model => model !== failedModel);
                        
                        // Try up to 3 different models
                        for (let attempt = 0; attempt < Math.min(3, availableModels.length); attempt++) {
                            const retryModel = availableModels[Math.floor(Math.random() * availableModels.length)];
                            
                            try {
                                // Update our stored model (don't touch settings)
                                window.openrouterRandomizerModel = retryModel;
                                
                                // Modify the request body with the new model
                                if (options && options.body) {
                                    const body = JSON.parse(options.body);
                                    body.model = retryModel;
                                    const retryOptions = {
                                        ...options,
                                        body: JSON.stringify(body)
                                    };
                                    
                                    // Try the request with the new model
                                    const retryResponse = await originalFetch(url, retryOptions);
                                    
                                    
                                    return retryResponse;
                                }
                            } catch (retryError) {
                                // Remove this model from available models for next attempt
                                const modelIndex = availableModels.indexOf(retryModel);
                                if (modelIndex > -1) {
                                    availableModels.splice(modelIndex, 1);
                                }
                            }
                        }
                        
                        // If all retries failed, silently handle
                        
                        // Reset to a known working model if possible
                        const fallbackModel = 'anthropic/claude-3-haiku';
                        window.openrouterRandomizerModel = fallbackModel;
                    }
                    
                    // Re-throw the original error for SillyTavern to handle
                    throw error;
                });
            };
            
            window.openrouterRandomizerFetchHooked = true;
            console.log(`[${MODULE_NAME}] Fetch interceptor set up`);
        }

        // Default models to select on first install (free models only)
        const DEFAULT_SELECTED_MODELS = [
            'deepseek/deepseek-v3',
            'deepseek/deepseek-v3-0324',
            'deepseek/deepseek-r1',
            'deepseek/deepseek-r1-0528',
            'deepseek/deepseek-r1-distill-llama-70b',
            'mistralai/mistral-nemo',
            'mistralai/mistral-small-3.2-24b',
            'qwen/qwen2.5-vl-72b-instruct',
            'qwen/qwen3-32b',
            'qwen/qwq-32b',
            'qwen/qwen2.5-72b-instruct',
            'tencent/hunyuan-a13b-instruct',
            'tng/deepseek-r1t2-chimera',
            'venice/venice-uncensored'
        ];

        // Helper function to populate model checkboxes in the UI
        function populateModelCheckboxes(models, settings, root) {
            const container = root.querySelector('#model-list-container');
            container.innerHTML = ''; // clear any existing content
            
            if (!models || models.length === 0) {
                container.innerHTML = "<p>No models found or API returned no data.</p>";
                return;
            }
            
            // Sort models alphabetically by name for easier scanning
            models.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
            
            // Store all model IDs for fallback
            const allModelIds = models.map(model => model.id);
            localStorage.setItem('orr_all', JSON.stringify(allModelIds));
            
            // Get saved selections
            const saved = new Set(getSaved());
            
            // Check if this is a first-time installation (no saved selections)
            const isFirstTime = saved.size === 0;
            const defaultSelectedSet = new Set(DEFAULT_SELECTED_MODELS);
            
            // Create a checkbox for each model
            for (const model of models) {
                const modelId = model.id;   // model.id is the identifier used in API calls
                const modelName = model.name || modelId; // model.name might be a human-readable name
                
                // Create a container div for each model item
                const modelDiv = document.createElement('div');
                modelDiv.className = 'model-item';
                
                // Add cost tier for CSS highlighting
                if (model.pricing) {
                    const inputCost = parseFloat(model.pricing.prompt);
                    if (inputCost === 0) {
                        modelDiv.setAttribute('data-cost-tier', 'free');
                    } else if (inputCost > 0) {
                        const tokensPerDollar = Math.round(1 / inputCost);
                        if (tokensPerDollar < 100000) {
                            modelDiv.setAttribute('data-cost-tier', 'expensive');
                        } else if (tokensPerDollar > 1000000) {
                            modelDiv.setAttribute('data-cost-tier', 'cheap');
                        }
                    }
                }
                
                // Create a checkbox input
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'model-checkbox';
                checkbox.value = modelId;
                checkbox.id = `chk-${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`;
                checkbox.dataset.model = modelId;
                
                // Set initial checked state - use defaults for first-time installation
                if (isFirstTime) {
                    checkbox.checked = defaultSelectedSet.has(modelId);
                } else {
                    checkbox.checked = saved.has(modelId);
                }
                
                // Create a label for the checkbox
                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.style.cursor = 'pointer';
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.padding = '8px';
                label.style.borderRadius = '4px';
                label.style.transition = 'background-color 0.2s';
                
                // Add hover effect
                label.addEventListener('mouseenter', () => {
                    label.style.backgroundColor = 'var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.05))';
                });
                label.addEventListener('mouseleave', () => {
                    label.style.backgroundColor = 'transparent';
                });
                
                // Create model name span with enhanced formatting
                const modelNameSpan = document.createElement('span');
                modelNameSpan.style.marginLeft = '8px';
                modelNameSpan.style.fontSize = '14px';
                modelNameSpan.style.lineHeight = '1.4';
                
                // Format: **Model Name** | Context | Cost
                const modelNameBold = document.createElement('strong');
                modelNameBold.textContent = modelName;
                modelNameSpan.appendChild(modelNameBold);
                
                // Add context information
                const contextSize = model.context_length || 'Unknown';
                const contextText = document.createElement('span');
                contextText.textContent = ` | ${contextSize.toLocaleString()} ctx`;
                contextText.style.color = 'var(--SmartThemeQuoteColor, #888)';
                modelNameSpan.appendChild(contextText);
                
                // Add cost information
                const costText = document.createElement('span');
                costText.style.color = 'var(--SmartThemeQuoteColor, #888)';
                
                // Format cost based on pricing data
                let costDisplay = '';
                if (model.pricing) {
                    const inputCost = parseFloat(model.pricing.prompt);
                    const outputCost = parseFloat(model.pricing.completion);
                    
                    if (inputCost === 0 && outputCost === 0) {
                        costDisplay = ' | Free';
                    } else {
                        // Calculate tokens per dollar (using input cost)
                        if (inputCost > 0) {
                            const tokensPerDollar = Math.round(1 / inputCost);
                            const tokensInK = Math.round(tokensPerDollar / 1000);
                            costDisplay = ` | ${tokensInK}k t/$`;
                        } else {
                            costDisplay = ' | Cost varies';
                        }
                    }
                } else {
                    costDisplay = ' | Cost varies';
                }
                
                costText.textContent = costDisplay;
                modelNameSpan.appendChild(costText);
                
                // Create favorite star button
                const starButton = document.createElement('button');
                starButton.className = 'favorite-star';
                starButton.textContent = isFavorite(modelId) ? '★' : '☆';
                starButton.title = isFavorite(modelId) ? 'Remove from favorites' : 'Add to favorites';
                starButton.type = 'button';
                
                if (isFavorite(modelId)) {
                    starButton.classList.add('favorited');
                }
                
                starButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent label click
                    
                    if (isFavorite(modelId)) {
                        removeFavorite(modelId);
                        starButton.textContent = '☆';
                        starButton.title = 'Add to favorites';
                        starButton.classList.remove('favorited');
                        showNotification(`Removed ${modelName} from favorites`);
                    } else {
                        addFavorite(modelId);
                        starButton.textContent = '★';
                        starButton.title = 'Remove from favorites';
                        starButton.classList.add('favorited');
                        showNotification(`Added ${modelName} to favorites`);
                    }
                });
                
                // Append checkbox, model name, and star to label
                label.appendChild(checkbox);
                label.appendChild(modelNameSpan);
                label.appendChild(starButton);
                
                // Append label to container
                modelDiv.appendChild(label);
                container.appendChild(modelDiv);
            }
            
            // Save default selections on first-time installation
            if (isFirstTime) {
                const availableDefaults = models
                    .filter(model => defaultSelectedSet.has(model.id))
                    .map(model => model.id);
                if (availableDefaults.length > 0) {
                    save(availableDefaults);
                }
            }
            
            // Add one delegated listener to update storage whenever any box is (un)checked
            container.onchange = () => {
                const chosen = [...container.querySelectorAll('input:checked')]
                                 .map(cb => cb.dataset.model);
                save(chosen);
            };
        }

        
        // Set up automatic randomization on generation using send button hook
        setupAutoRandomization();
        
        // Set up randomization on alternative response (arrow) button clicks
        setupSwipeRandomization();

        function setupAutoRandomization() {
            // Try multiple possible send button selectors
            const sendButtonSelectors = [
                '#send_but',
                '#send_button', 
                '[id*="send"]',
                'button[type="submit"]',
                '.send_button',
                '#form_sheld button'
            ];
            
            let sendButton = null;
            for (const selector of sendButtonSelectors) {
                sendButton = document.querySelector(selector);
                if (sendButton) {
                    break;
                }
            }
            
            if (!sendButton) {
                setTimeout(() => setupAutoRandomization(), 1000);
                return;
            }
            
            if (!sendButton.hasAttribute('data-orr-hooked')) {
                sendButton.setAttribute('data-orr-hooked', 'true');
                
                let handlerRunning = false;
                const randomizeHandler = () => {
                    if (handlerRunning) {
                        return;
                    }
                    handlerRunning = true;
                    
                    // Load settings using consistent function
                    const settings = loadSettings();
                    
                    console.log(`[${MODULE_NAME}] setupAutoRandomization() - randomizeModels:`, settings.randomizeModels);
                    if (!settings.randomizeModels) {
                        console.log(`[${MODULE_NAME}] setupAutoRandomization() - randomization disabled, returning`);
                        handlerRunning = false;
                        return;
                    }
                    
                    // Get models from localStorage
                    const chosenRaw = localStorage.getItem('orr_selected') || '[]';
                    const allRaw = localStorage.getItem('orr_all') || '[]';
                    
                    const chosen = JSON.parse(chosenRaw);
                    const pool = chosen.length ? chosen : JSON.parse(allRaw);
                    
                    if (!pool.length) {
                        handlerRunning = false;
                        return;
                    }
                    
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    
                    // Store the selected model for API interception
                    window.openrouterRandomizerModel = pick;
                    
                    
                    handlerRunning = false;
                };
                
                // Add multiple event listeners to catch different scenarios
                const clickHandler = (event) => {
                    randomizeHandler();
                };
                
                sendButton.addEventListener('click', clickHandler, true); // use capture
                sendButton.addEventListener('mousedown', clickHandler, true);
                sendButton.addEventListener('touchstart', clickHandler, true);
                
                // Also try without capture
                sendButton.addEventListener('click', clickHandler, false);
                sendButton.addEventListener('mousedown', clickHandler, false);
                
                // Also hook into the text input for Enter key detection
                const textInput = document.querySelector('#send_textarea');
                if (textInput) {
                    textInput.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            randomizeHandler();
                        }
                    });
                }
                
                // Try hooking into the form submission
                const sendForm = document.querySelector('#send_form');
                if (sendForm) {
                    sendForm.addEventListener('submit', (event) => {
                        randomizeHandler();
                    });
                }
                
            }
        }

        function setupSwipeRandomization() {
            // Try multiple possible arrow/swipe button selectors
            const swipeButtonSelectors = [
                '.swipe_right',
                '.swipe_left', 
                '[title*="alternative"]',
                '[title*="swipe"]',
                '[title*="retry"]',
                '.mes_button[title*="Get alternative response"]',
                '.mes_button[title*="Swipe"]',
                'button[title*="alternative"]',
                'button[title*="swipe"]',
                '.fa-arrow-right',
                '.fa-arrow-left',
                '.fa-chevron-right',
                '.fa-chevron-left',
                'button:has(.fa-arrow-right)',
                'button:has(.fa-arrow-left)',
                'button:has(.fa-chevron-right)',
                'button:has(.fa-chevron-left)'
            ];
            
            // Function to set up event listeners on swipe buttons
            const setupSwipeButtons = () => {
                swipeButtonSelectors.forEach(selector => {
                    try {
                        const buttons = document.querySelectorAll(selector);
                        buttons.forEach(button => {
                            if (!button.hasAttribute('data-orr-swipe-hooked')) {
                                button.setAttribute('data-orr-swipe-hooked', 'true');
                                
                                const swipeHandler = () => {
                                    // Load settings using consistent function
                                    const settings = loadSettings();
                                    
                                    console.log(`[${MODULE_NAME}] setupSwipeRandomization() - randomizeModels:`, settings.randomizeModels);
                                    if (!settings.randomizeModels) {
                                        console.log(`[${MODULE_NAME}] setupSwipeRandomization() - randomization disabled, returning`);
                                        return;
                                    }
                                    
                                    // Get models from localStorage
                                    const chosenRaw = localStorage.getItem('orr_selected') || '[]';
                                    const allRaw = localStorage.getItem('orr_all') || '[]';
                                    
                                    const chosen = JSON.parse(chosenRaw);
                                    const pool = chosen.length ? chosen : JSON.parse(allRaw);
                                    
                                    if (!pool.length) {
                                        return;
                                    }
                                    
                                    const pick = pool[Math.floor(Math.random() * pool.length)];
                                    
                                    // Store the selected model for API interception
                                    window.openrouterRandomizerModel = pick;
                                };
                                
                                // Add event listeners for various interaction types
                                button.addEventListener('click', swipeHandler, true);
                                button.addEventListener('mousedown', swipeHandler, true);
                                button.addEventListener('touchstart', swipeHandler, true);
                            }
                        });
                    } catch (e) {
                        // Ignore selector errors (some might not be valid CSS)
                    }
                });
            };
            
            // Set up initial buttons
            setupSwipeButtons();
            
            // Set up a mutation observer to catch dynamically added swipe buttons
            const observer = new MutationObserver((mutations) => {
                let shouldSetup = false;
                mutations.forEach(mutation => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Check if the added node or its children contain swipe buttons
                                const hasSwipeButton = swipeButtonSelectors.some(selector => {
                                    try {
                                        return node.matches && node.matches(selector) || 
                                               node.querySelector && node.querySelector(selector);
                                    } catch (e) {
                                        return false;
                                    }
                                });
                                if (hasSwipeButton) {
                                    shouldSetup = true;
                                }
                            }
                        });
                    }
                });
                
                if (shouldSetup) {
                    // Debounce the setup call
                    setTimeout(setupSwipeButtons, 100);
                }
            });
            
            // Start observing
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

    } catch (error) {
        // Silent error handling
    } finally {
        // Restore original console.warn
        if (typeof originalWarn === 'function') {
            console.warn = originalWarn;
        }
    }
})();