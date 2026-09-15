import { loadActiveModeSettings, resetInactivityTimer } from './activeModeManager.js';

// 🎙️ Configuration des langues et voix par moteur TTS
const TTS_CONFIG = {
    'edge-tts': {
        languages: [
            { code: 'fr', name: 'Français' },
            { code: 'en', name: 'Anglais' }
        ],
        voices: {
            fr: [
                { id: 'fr-FR-DeniseNeural', name: 'Denise (Femme - France)' },
                { id: 'fr-FR-HenriNeural', name: 'Henri (Homme - France)' },
                { id: 'fr-FR-EloiseNeural', name: 'Eloise (Femme - France)' },
                { id: 'fr-FR-RemyMultilingualNeural', name: 'Remy (Homme - Multilingue)' },
                { id: 'fr-CA-SylvieNeural', name: 'Sylvie (Femme - Canada)' },
                { id: 'fr-CA-AntoineNeural', name: 'Antoine (Homme - Canada)' },
                { id: 'fr-CH-ArianeNeural', name: 'Ariane (Femme - Suisse)' },
                { id: 'fr-BE-CharlineNeural', name: 'Charline (Femme - Belgique)' }
            ],
            en: [
                { id: 'en-US-JennyNeural', name: 'Jenny (Femme - USA)' },
                { id: 'en-US-GuyNeural', name: 'Guy (Homme - USA)' },
                { id: 'en-US-AriaNeural', name: 'Aria (Femme - USA)' },
                { id: 'en-GB-SoniaNeural', name: 'Sonia (Femme - UK)' },
                { id: 'en-GB-RyanNeural', name: 'Ryan (Homme - UK)' },
                { id: 'en-AU-NatashaNeural', name: 'Natasha (Femme - Australie)' }
            ]
        }
    },
    'piper': {
        languages: [
            { code: 'fr', name: 'Français (Local Piper)' },
            { code: 'en', name: 'Anglais (Local Piper)' }
        ],
        voices: {
            fr: [
                { id: 'fr_FR-upmc-medium', name: 'UPMC (Femme - France - Médium)' },
                { id: 'fr_FR-tom-medium', name: 'Tom (Homme - France - Médium)' },
                { id: 'fr_FR-siwis-low', name: 'Siwis (Femme - France - Low)' }
            ],
            en: [
                { id: 'en_US-lessac-medium', name: 'Lessac (USA - Médium)' },
                { id: 'en_US-danny-low', name: 'Danny (USA - low)' },
                { id: 'en_US-amy-medium', name: 'Amy (USA - Médium)' }
            ]
        }
    }
};

export function initOptionsUI() {
    // Stockage local des détails de chaque dossier de modèle
    let cachedModelDetails = [];

    function getTavilyInput() {
        return document.querySelector('input[placeholder*="Tavily"]') || 
               document.querySelector('input[placeholder*="tvly"]') ||
               document.getElementById('input-tavily-key') ||
               document.getElementById('tavily-api-key-input');
    }

    const ttsEngineSelect = document.getElementById('select-tts-engine');
    const ttsLangSelect = document.getElementById('select-tts-lang');
    const ttsVoiceSelect = document.getElementById('select-tts-voice');
    const ttsSpeedSlider = document.getElementById('tts-speed-slider');
    const ttsSpeedDisplay = document.getElementById('tts-speed-display');

    const tempSlider = document.getElementById('temp-slider');
    const tempDisplay = document.getElementById('temp-value');

    const ggufSelect = document.getElementById('select-gguf-model');
    const mmprojSelect = document.getElementById('select-mmproj-model');
    const contextSelect = document.getElementById('select-context-size');
    const maxMsgSelect = document.getElementById('select-max-messages');
    
    const promptInput = document.getElementById('system-prompt-input');
    const goalsInput = document.getElementById('autolearning-goals-input');
    
    const modeSelect = document.getElementById('select-interaction-mode');
    const delayInput = document.getElementById('input-inactivity-delay');

    const armSpreadSlider = document.getElementById('vrm-arm-spread-slider');
    const armSpreadDisplay = document.getElementById('vrm-arm-spread-display');
    const btnResetArmSpread = document.getElementById('btn-reset-arm-spread');

    const legSpreadSlider = document.getElementById('vrm-leg-spread-slider');
    const legSpreadDisplay = document.getElementById('vrm-leg-spread-display');
    const btnResetLegSpread = document.getElementById('btn-reset-leg-spread');

    const DEFAULT_ARM_SPREAD = 0.05625;
    const DEFAULT_LEG_SPREAD = 0;

    function formatSpreadDegrees(radians) {
        return `${(parseFloat(radians) * 180 / Math.PI).toFixed(1)}°`;
    }

    // Applique en direct (à la volée) + persiste immédiatement pour le modèle VRM actif
    function applyAndSaveArmSpread(value) {
        if (typeof window.setVRMArmSpread === 'function') window.setVRMArmSpread(value);
        if (typeof window.savePoseOffsetForModel === 'function' && typeof window.getCurrentVrmUrl === 'function') {
            const currentLeg = legSpreadSlider ? parseFloat(legSpreadSlider.value) : DEFAULT_LEG_SPREAD;
            window.savePoseOffsetForModel(window.getCurrentVrmUrl(), parseFloat(value), currentLeg);
        }
    }

    function applyAndSaveLegSpread(value) {
        if (typeof window.setVRMLegSpread === 'function') window.setVRMLegSpread(value);
        if (typeof window.savePoseOffsetForModel === 'function' && typeof window.getCurrentVrmUrl === 'function') {
            const currentArm = armSpreadSlider ? parseFloat(armSpreadSlider.value) : DEFAULT_ARM_SPREAD;
            window.savePoseOffsetForModel(window.getCurrentVrmUrl(), currentArm, parseFloat(value));
        }
    }

    if (armSpreadSlider && armSpreadDisplay) {
        armSpreadSlider.addEventListener('input', () => {
            armSpreadDisplay.textContent = formatSpreadDegrees(armSpreadSlider.value);
            applyAndSaveArmSpread(armSpreadSlider.value);
        });
    }

    if (legSpreadSlider && legSpreadDisplay) {
        legSpreadSlider.addEventListener('input', () => {
            legSpreadDisplay.textContent = formatSpreadDegrees(legSpreadSlider.value);
            applyAndSaveLegSpread(legSpreadSlider.value);
        });
    }

    if (btnResetArmSpread) {
        btnResetArmSpread.addEventListener('click', () => {
            if (armSpreadSlider) armSpreadSlider.value = DEFAULT_ARM_SPREAD;
            if (armSpreadDisplay) armSpreadDisplay.textContent = formatSpreadDegrees(DEFAULT_ARM_SPREAD);
            applyAndSaveArmSpread(DEFAULT_ARM_SPREAD);
        });
    }

    if (btnResetLegSpread) {
        btnResetLegSpread.addEventListener('click', () => {
            if (legSpreadSlider) legSpreadSlider.value = DEFAULT_LEG_SPREAD;
            if (legSpreadDisplay) legSpreadDisplay.textContent = formatSpreadDegrees(DEFAULT_LEG_SPREAD);
            applyAndSaveLegSpread(DEFAULT_LEG_SPREAD);
        });
    }

    // Resynchronise les sliders sur les valeurs du modèle VRM à chaque chargement/changement
    function syncPoseSlidersFromDetail(detail) {
        const arm = detail && typeof detail.arm === 'number' ? detail.arm : DEFAULT_ARM_SPREAD;
        const leg = detail && typeof detail.leg === 'number' ? detail.leg : DEFAULT_LEG_SPREAD;
        if (armSpreadSlider) armSpreadSlider.value = arm;
        if (armSpreadDisplay) armSpreadDisplay.textContent = formatSpreadDegrees(arm);
        if (legSpreadSlider) legSpreadSlider.value = leg;
        if (legSpreadDisplay) legSpreadDisplay.textContent = formatSpreadDegrees(leg);
    }

    window.addEventListener('vrm-pose-loaded', (e) => syncPoseSlidersFromDetail(e.detail));

    const categoriesView = document.getElementById('options-categories-view');
    const categoryBtns = document.querySelectorAll('.category-item-btn[data-target]');
    const backBtns = document.querySelectorAll('.btn-back-category');
    const panels = document.querySelectorAll('.options-panel');
    
    const saveBtns = document.querySelectorAll('.btn-save-options');
    const statusMsgs = document.querySelectorAll('.options-drawer-body .status-msg');

    const optionsCloseBtn = document.getElementById('btn-close-options');
    const optionsOverlay = document.getElementById('options-overlay');

    function showCategoriesMenu() {
        panels.forEach(panel => panel.classList.remove('active'));
        if (categoriesView) categoriesView.classList.add('active');
    }

    function openPanel(targetId) {
        const targetPanel = document.getElementById(targetId);
        if (!targetPanel) return;

        if (categoriesView) categoriesView.classList.remove('active');
        panels.forEach(panel => panel.classList.remove('active'));
        targetPanel.classList.add('active');

        loadConfig();

        if (targetId === 'panel-vrm-pose') {
            syncPoseSlidersFromDetail({
                arm: typeof window.getVRMArmSpread === 'function' ? window.getVRMArmSpread() : undefined,
                leg: typeof window.getVRMLegSpread === 'function' ? window.getVRMLegSpread() : undefined
            });
        }
    }

    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            if (target) openPanel(target);
        });
    });

    backBtns.forEach(btn => btn.addEventListener('click', showCategoriesMenu));
    if (optionsCloseBtn) optionsCloseBtn.addEventListener('click', showCategoriesMenu);
    if (optionsOverlay) optionsOverlay.addEventListener('click', showCategoriesMenu);

    function updateLangDropdown(targetLang = null) {
        if (!ttsLangSelect) return;

        const engine = ttsEngineSelect ? ttsEngineSelect.value : 'edge-tts';
        const engineData = TTS_CONFIG[engine] || TTS_CONFIG['edge-tts'];
        const availableLangs = engineData.languages || [];

        ttsLangSelect.innerHTML = '';

        availableLangs.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = lang.name;
            if (targetLang && lang.code === targetLang) {
                opt.selected = true;
            }
            ttsLangSelect.appendChild(opt);
        });

        if (!availableLangs.some(l => l.code === ttsLangSelect.value) && availableLangs.length > 0) {
            ttsLangSelect.value = availableLangs[0].code;
        }
    }

    function updateVoiceDropdown(targetVoice = null) {
        if (!ttsVoiceSelect) return;

        const engine = ttsEngineSelect ? ttsEngineSelect.value : 'edge-tts';
        const lang = ttsLangSelect ? ttsLangSelect.value : 'fr';

        const engineData = TTS_CONFIG[engine] || TTS_CONFIG['edge-tts'];
        const availableVoices = (engineData.voices && engineData.voices[lang]) ? engineData.voices[lang] : [];

        ttsVoiceSelect.innerHTML = '';

        availableVoices.forEach(voice => {
            const opt = document.createElement('option');
            opt.value = voice.id;
            opt.textContent = voice.name;
            if (targetVoice && voice.id === targetVoice) {
                opt.selected = true;
            }
            ttsVoiceSelect.appendChild(opt);
        });
    }

    if (ttsEngineSelect) {
        ttsEngineSelect.addEventListener('change', () => {
            updateLangDropdown();
            updateVoiceDropdown();
        });
    }

    if (ttsLangSelect) {
        ttsLangSelect.addEventListener('change', () => {
            updateVoiceDropdown();
        });
    }

     if (ttsSpeedSlider && ttsSpeedDisplay) {
        ttsSpeedSlider.addEventListener('input', () => {
            ttsSpeedDisplay.textContent = `${parseFloat(ttsSpeedSlider.value).toFixed(1)}x`;
        });
    }
 
    if (tempSlider && tempDisplay) {
        tempSlider.addEventListener('input', () => {
            tempDisplay.textContent = parseFloat(tempSlider.value).toFixed(2);
        });
    }

    // 👁️ Mise à jour dynamique du menu déroulant Vision selon le modèle LLM sélectionné
    function updateVisionDropdownForSelectedModel(targetMmproj = undefined) {
        if (!mmprojSelect) return;

        const selectedLlmPath = ggufSelect ? ggufSelect.value : '';
        const currentDetail = cachedModelDetails.find(d => d.llmPath === selectedLlmPath);

        mmprojSelect.innerHTML = '<option value="">-- Aucun (Désactiver vision) --</option>';

        if (currentDetail && currentDetail.hasVision) {
            const opt = document.createElement('option');
            opt.value = currentDetail.visionPath;
            opt.textContent = `${currentDetail.visionFile} (${currentDetail.folder})`;

            if (targetMmproj !== undefined) {
                // Si une valeur sauvegardée a été transmise
                if (targetMmproj && currentDetail.visionPath === targetMmproj) {
                    opt.selected = true;
                }
            } else {
                // Auto-sélectionne le modèle vision si changement manuel de LLM
                opt.selected = true;
            }

            mmprojSelect.appendChild(opt);
        }
    }

    // Changement dynamique au changement de sélection du LLM
    if (ggufSelect) {
        ggufSelect.addEventListener('change', () => {
            updateVisionDropdownForSelectedModel();
        });
    }

    async function loadGgufModels() {
        if (!ggufSelect) return;
        try {
            const res = await fetch('/api/gguf-models');
            if (res.ok) {
                const data = await res.json();
                cachedModelDetails = data.modelDetails || [];

                ggufSelect.innerHTML = '';
                if (data.models && data.models.length > 0) {
                    data.models.forEach(modelPath => {
                        const opt = document.createElement('option');
                        opt.value = modelPath;

                        const detail = cachedModelDetails.find(d => d.llmPath === modelPath);
                        if (detail) {
                            if (detail.folder) {
                                // Affichage : "Dossier (nom_fichier)"
                                const cleanFileName = detail.llmFile.replace(/\.gguf$/i, '');
                                opt.textContent = `${detail.folder} (${cleanFileName})`;
                            } else {
                                opt.textContent = detail.llmFile;
                            }
                        } else {
                            opt.textContent = modelPath;
                        }

                        if (modelPath === data.current) opt.selected = true;
                        ggufSelect.appendChild(opt);
                    });
                } else {
                    ggufSelect.innerHTML = '<option value="">Aucun modèle .gguf trouvé</option>';
                    if (typeof window.showModelMissingPopup === 'function') {
                        window.showModelMissingPopup();
                    }
                }

                // Met à jour la liste vision correspondante
                updateVisionDropdownForSelectedModel();
            }
        } catch (err) {
            console.error('Erreur chargement modèles GGUF:', err);
        }
    }

    async function loadConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                const config = await res.json();

                if (config.ttsEngine && ttsEngineSelect) ttsEngineSelect.value = config.ttsEngine;
                
                updateLangDropdown(config.ttsLang);
                updateVoiceDropdown(config.ttsVoice);

                const speed = config.ttsSpeed || config.tts_speed || 1.0;
                if (ttsSpeedSlider) ttsSpeedSlider.value = speed;
                if (ttsSpeedDisplay) ttsSpeedDisplay.textContent = `${parseFloat(speed).toFixed(1)}x`;

                const tempVal = config.temperature !== undefined ? config.temperature : 0.7;
                if (tempSlider) tempSlider.value = tempVal;
                if (tempDisplay) tempDisplay.textContent = parseFloat(tempVal).toFixed(2);

                if (config.selectedGgufModel && ggufSelect) {
                    ggufSelect.value = config.selectedGgufModel;
                }

                // Synchro du menu vision selon la config enregistrée
                const savedMmproj = config.selectedMmprojModel || config.selectedMmproj || '';
                updateVisionDropdownForSelectedModel(savedMmproj);

                if (config.contextSize && contextSelect) contextSelect.value = config.contextSize;
                if (config.maxMessages && maxMsgSelect) maxMsgSelect.value = config.maxMessages;
                
                const promptVal = config.systemPrompt || config.system_prompt || '';
                if (promptInput) promptInput.value = promptVal;

                const currentMode = config.interactionMode || config.interaction_mode || 'passif';
                if (modeSelect) modeSelect.value = currentMode;

                const currentDelay = config.inactivityDelay || config.inactivity_delay || 30;
                if (delayInput) delayInput.value = currentDelay;

                const tavilyInput = getTavilyInput();
                const realTavilyKey = config.tavily_api_key || config.tavilyApiKey || config.tavilyKey || '';
                if (tavilyInput && realTavilyKey) tavilyInput.value = realTavilyKey;
            }
        } catch (err) {
            console.error('Erreur chargement configuration:', err);
        }
    }

    async function loadGoals() {
        if (!goalsInput) return;
        try {
            const res = await fetch('/api/goals');
            if (res.ok) {
                const data = await res.json();
                const list = data.goals || (Array.isArray(data) ? data : []);
                if (Array.isArray(list)) {
                    goalsInput.value = list.map(g => typeof g === 'object' ? (g.name || g.description || '') : String(g)).filter(Boolean).join('\n');
                }
            }
        } catch (err) {
            console.error('Erreur chargement objectifs:', err);
        }
    }

    async function init() {
        await loadGgufModels();
        await loadConfig();
        await loadGoals();
    }

    init();

    async function saveAllOptions() {
        saveBtns.forEach(btn => btn.disabled = true);
        
        statusMsgs.forEach(msg => {
            msg.textContent = '⏳ Enregistrement de la configuration...';
            msg.className = 'status-msg visible';
            msg.style.color = '#f1c40f';
        });

        // 1. Charger la config existante pour préserver toutes les clés
        let existingConfig = {};
        try {
            const res = await fetch('/api/config');
            if (res.ok) existingConfig = await res.json();
        } catch (e) {
            console.warn("Impossible de lire la config existante :", e);
        }

        const tavilyInput = getTavilyInput();
        const currentTavilyKey = tavilyInput && tavilyInput.value.trim() !== '' 
            ? tavilyInput.value.trim() 
            : (existingConfig.tavily_api_key || existingConfig.tavilyApiKey || '');

        // Sécurité : si le champ prompt est vide dans ce panneau, on conserve impérativement la valeur déjà enregistrée
        const promptVal = (promptInput && promptInput.value.trim() !== '') 
            ? promptInput.value 
            : (existingConfig.system_prompt || existingConfig.systemPrompt || '');

        // Payload complet envoyé avec double-compatibilité de nommage
        const configData = {
            ...existingConfig,
            temperature: tempSlider ? parseFloat(tempSlider.value) : (existingConfig.temperature ?? 0.7),
            ttsEngine: ttsEngineSelect ? ttsEngineSelect.value : (existingConfig.ttsEngine || 'edge-tts'),
            ttsLang: ttsLangSelect ? ttsLangSelect.value : (existingConfig.ttsLang || 'fr'),
            ttsVoice: ttsVoiceSelect ? ttsVoiceSelect.value : (existingConfig.ttsVoice || ''),
            ttsSpeed: ttsSpeedSlider ? parseFloat(ttsSpeedSlider.value) : (existingConfig.ttsSpeed || 1.0),
            tts_speed: ttsSpeedSlider ? parseFloat(ttsSpeedSlider.value) : (existingConfig.tts_speed || 1.0),
            selectedGgufModel: ggufSelect ? ggufSelect.value : (existingConfig.selectedGgufModel || ''),
            selectedMmprojModel: mmprojSelect ? mmprojSelect.value : (existingConfig.selectedMmprojModel || ''),
            contextSize: contextSelect ? parseInt(contextSelect.value, 10) : (existingConfig.contextSize || 4096),
            maxMessages: maxMsgSelect ? parseInt(maxMsgSelect.value, 10) : (existingConfig.maxMessages || 25),
            systemPrompt: promptVal,
            system_prompt: promptVal,
            interactionMode: modeSelect ? modeSelect.value : (existingConfig.interactionMode || 'passif'),
            interaction_mode: modeSelect ? modeSelect.value : (existingConfig.interaction_mode || 'passif'),
            inactivityDelay: delayInput ? parseInt(delayInput.value, 10) : (existingConfig.inactivityDelay || 30),
            inactivity_delay: delayInput ? parseInt(delayInput.value, 10) : (existingConfig.inactivity_delay || 30),
            tavily_api_key: currentTavilyKey
        };

        const rawGoals = goalsInput ? goalsInput.value.split('\n') : [];
        const goalsData = rawGoals
            .map(line => line.replace(/^[-*•]\s*/, '').trim())
            .filter(line => line.length > 0);

        try {
            const resConfig = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configData)
            });

            const resGoals = await fetch('/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goals: goalsData })
            });

            // Synchronisation directe vers Tauri (s'il est présent) avec l'objet COMPLET fusionné
            if (window.__TAURI__?.core?.invoke) {
                try {
                    await window.__TAURI__.core.invoke('save_config', {
                        relativePath: "data/config.json",
                        jsonData: configData
                    });
                } catch (tErr) {
                    console.warn("Note Tauri save_config:", tErr);
                }
            }

            if (resConfig.ok && resGoals.ok) {
                // 🤖 Rechargement immédiat et relance du timer d'inactivité
                await loadActiveModeSettings();
                resetInactivityTimer();

                statusMsgs.forEach(msg => {
                    msg.textContent = '✅ Configuration enregistrée !';
                    msg.style.color = '#2ecc71';
                });
            } else {
                let payload = null;
                try { payload = await resConfig.json(); } catch (e) {}

                if (payload && payload.modelMissing) {
                    statusMsgs.forEach(msg => {
                        msg.textContent = '⚠️ Configuration enregistrée, mais modèle introuvable';
                        msg.style.color = '#f1c40f';
                    });
                    if (typeof window.showModelMissingPopup === 'function') {
                        window.showModelMissingPopup();
                    }
                } else {
                    throw new Error(`Erreur serveur HTTP (${resConfig.status})`);
                }
            }
        } catch (err) {
            console.error('Erreur sauvegarde:', err);
            statusMsgs.forEach(msg => {
                msg.textContent = '❌ Erreur de sauvegarde backend';
                msg.style.color = '#e74c3c';
            });
        } finally {
            setTimeout(() => {
                saveBtns.forEach(btn => btn.disabled = false);
                statusMsgs.forEach(msg => msg.classList.remove('visible'));
            }, 2000);
        }
    }

    saveBtns.forEach(btn => {
        btn.addEventListener('click', saveAllOptions);
    });
}