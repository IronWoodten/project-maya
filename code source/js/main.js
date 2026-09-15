import { sendMessageToLLM } from './llm.js';
import { SpeechManager } from './SpeechManager.js';
import { parseTags } from './vrm.js';
import { 
    saveMessageToCurrentChat, 
    getCurrentChatMessages, 
    getCurrentChat 
} from './chatHistory.js';
import { initHistoryUI, renderHistoryList } from './historyUI.js';
import { initOptionsUI } from './optionsUI.js';
import { initBgUI } from './bgUI.js';
import { initAutoLearningUI } from './autolearningUI.js';
import { mayaMCP } from './mcpClient.js';
import { loadCustomPersona } from './promptManager.js';
import { FaceManager } from './FaceManager.js';
import { ScreenManager } from './ScreenManager.js';

// 🤖 Import pour le Mode Actif / Relance automatique
import { resetInactivityTimer, resetRelanceCount, setLLMBusyState, loadActiveModeSettings } from './activeModeManager.js';

export const faceManager = new FaceManager();
window.faceManager = faceManager;

export let screenManager = null;

const WHISPER_SERVER_URL = 'http://127.0.0.1:5006/transcribe';

let isRecording = false;        
let isProcessingSlice = false;  
let hasSpokenInSlice = false;   

let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];

let audioContext = null;
let analyser = null;
let checkSilenceInterval = null;
let lastSoundDetectedTime = Date.now();

// Anti-rebond global pour éviter les doubles envois et animations
let lastAnimationTriggerTime = 0;
let isSending = false;
window.isSending = false;

// Controller pour annuler la requête LLM en cours en cas d'interruption
let currentLLmAbortController = null;

const SILENCE_THRESHOLD = 12;   
const SILENCE_DURATION = 1200;  

function scrollToBottom() {
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
        requestAnimationFrame(() => {
            chatBody.scrollTop = chatBody.scrollHeight;
        });
    }
}

function updateMiniWidget(content, sender) {
    const miniMsg = document.querySelector('.mini-last-message') || document.getElementById('mini-last-message');
    if (miniMsg) {
        const prefix = sender === 'user' ? 'Vous: ' : 'Maya: ';
        miniMsg.textContent = prefix + content;
        miniMsg.scrollTop = miniMsg.scrollHeight;
    }
}

function updateMicUI(recording) {
    const micBtn = document.getElementById('btn-mic');
    if (!micBtn) return;
    const icon = micBtn.querySelector('i');

    if (recording) {
        micBtn.classList.add('recording');
        if (icon) {
            icon.className = 'fa-solid fa-microphone';
            icon.style.color = '#ffffff';
        }
    } else {
        micBtn.classList.remove('recording');
        if (icon) {
            icon.className = 'fa-solid fa-microphone-slash';
            icon.style.color = '#ff4d4d';
        }
    }
}

async function toggleMicrophone() {
    if (isRecording) {
        stopContinuousListening();
    } else {
        await startContinuousListening();
    }
}

async function startContinuousListening() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);
        analyser.fftSize = 256;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        checkSilenceInterval = setInterval(() => {
            if (!analyser || !isRecording || isProcessingSlice) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
            let averageVolume = sum / bufferLength;

            if (averageVolume > SILENCE_THRESHOLD) {
                lastSoundDetectedTime = Date.now();
                hasSpokenInSlice = true;
                resetInactivityTimer();
                if (SpeechManager.currentAudio || SpeechManager.activeAbortController) {
                    SpeechManager.stop();
                }
            } else {
                if (hasSpokenInSlice && (Date.now() - lastSoundDetectedTime > SILENCE_DURATION)) {
                    hasSpokenInSlice = false;
                    cutAndSendSlice();
                }
            }
        }, 100);

        isRecording = true;
        updateMicUI(true);
        startRecordingSlice();
    } catch (err) {
        stopContinuousListening();
    }
}

function startRecordingSlice() {
    if (!mediaStream || !isRecording) return;
    audioChunks = [];
    hasSpokenInSlice = false;
    lastSoundDetectedTime = Date.now();
    isProcessingSlice = false;

    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = (e) => { 
        if (e.data.size > 0) audioChunks.push(e.data); 
    };

    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        if (isRecording) startRecordingSlice();
        if (audioBlob.size > 3000) await sendAudioToWhisper(audioBlob);
    };

    mediaRecorder.start();
}

function cutAndSendSlice() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        isProcessingSlice = true;
        mediaRecorder.stop();
    }
}

function stopContinuousListening() {
    isRecording = false;
    isProcessingSlice = false;

    if (checkSilenceInterval) { 
        clearInterval(checkSilenceInterval); 
        checkSilenceInterval = null; 
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (mediaStream) { 
        mediaStream.getTracks().forEach(t => t.stop()); 
        mediaStream = null; 
    }

    if (audioContext) { 
        audioContext.close().catch(() => {}); 
        audioContext = null; 
    }

    updateMicUI(false);
}

async function sendAudioToWhisper(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');

    try {
        const response = await fetch(WHISPER_SERVER_URL, { 
            method: 'POST', 
            body: formData 
        });

        if (!response.ok) return;

        const data = await response.json();

        if (data.text && data.text.trim().length > 0) {
            const userInput = document.getElementById('user-input');

            if (userInput) {
                userInput.value = data.text;
                await sendMessage();
            }
        }
    } catch (err) {}
}

function stopAll() {
    SpeechManager.stop();

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    document.querySelectorAll('audio, video').forEach(m => { 
        m.pause(); 
        m.currentTime = 0; 
    });

    if (isRecording) stopContinuousListening();
}

function handleContinue() {
    const userInput = document.getElementById('user-input');

    if (userInput) {
        userInput.value = "Continue s'il te plaît.";
        sendMessage();
    }
}

async function checkMayaHubStatus() {
    const statusBadge = document.getElementById('hub-status');
    if (!statusBadge) return;

    try {
        const isConnected = await mayaMCP.connect();

        if (isConnected) {
            statusBadge.classList.add('connected');
            statusBadge.title = "Hub Maya (Port 5005) : Connecté";
        } else {
            statusBadge.classList.remove('connected');
            statusBadge.title = "Hub Maya (Port 5005) : Déconnecté";
        }
    } catch (err) {
        statusBadge.classList.remove('connected');
    }
}

function escapeHTML(str) {
    if (!str) return '';

    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function appendMessage(content, sender) {
    const chatBody = document.getElementById('chat-body');
    if (!chatBody) return null;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;

    const prefix = sender === 'user' ? 'U' : 'M';

    msgDiv.innerHTML = `<strong>${prefix}:</strong> ${escapeHTML(content)}`;

    chatBody.appendChild(msgDiv);
    scrollToBottom();

    return msgDiv;
}

function clearChatUI() {
    const chatBody = document.getElementById('chat-body');

    if (chatBody) {
        chatBody.innerHTML = '';
    }
}

function loadChatIntoUI(chat) {
    clearChatUI();

    if (chat && Array.isArray(chat.messages)) {
        chat.messages.forEach(msg => {
            const sender = (msg.role === 'user') ? 'user' : 'llm';
            appendMessage(msg.content, sender);
        });
    }
}

async function sendMessage() {
    const userInput = document.getElementById('user-input');
    const miniInput = document.getElementById('mini-user-input');
    
    let text = '';

    if (userInput && userInput.value.trim().length > 0) {
        text = userInput.value.trim();
    } else if (miniInput && miniInput.value.trim().length > 0) {
        text = miniInput.value.trim();
    }

    let screenImage = null;

    if (screenManager && typeof screenManager.isActive === 'function' && screenManager.isActive()) {
        try {
            screenImage = await screenManager.captureFrame();
        } catch (err) {
            console.error("Échec de la capture d'écran :", err);
        }
    }

    if (!text && !screenImage) return;

    // 🛑 Si l'IA est déjà en train de parler/générer, on coupe la réponse précédente pour prioriser la nouvelle
    if (isSending) {
        SpeechManager.stop();
        if (currentLLmAbortController) {
            currentLLmAbortController.abort();
        }
    }

    isSending = true;
    window.isSending = true;
    currentLLmAbortController = new AbortController();

    // 🤖 Réinitialise le compteur de relances consécutives (l'utilisateur a envoyé un message)
    resetRelanceCount();

    // 🤖 On met le timer en pause pendant que l'IA réfléchit
    setLLMBusyState(true);

    SpeechManager.stop();

    try {
        const textToSend = text || "(Regarde mon écran)";

        appendMessage(textToSend, 'user');
        updateMiniWidget(textToSend, 'user');
        
        await saveMessageToCurrentChat('user', textToSend);

        if (userInput) userInput.value = '';
        if (miniInput) miniInput.value = '';

        await renderHistoryList();

        const loadingMessage = appendMessage('...', 'llm');
        const historyMessages = await getCurrentChatMessages();

        // 🔥 Affichage progressif (streaming) : on accumule les tokens
        // reçus et on met à jour le message à chaque morceau, au lieu
        // d'attendre la fin complète de la génération.
        let streamedText = '';
        let sentenceBuffer = '';

        // Réinitialise le moteur vocal avant le nouveau message
        SpeechManager.isStopped = false;
        // 🎭 Nouveau tour de réponse -> ré-autorise le déclenchement d'émotion
        // sur la 1ère phrase (voir hasTriggeredEmotionForTurn dans SpeechManager)
        SpeechManager.startNewResponse();

        const handleToken = (tokenChunk) => {
            streamedText += tokenChunk;
            sentenceBuffer += tokenChunk;
            
            // Nettoyage à la volée pour ne pas afficher les tags [happy] ou VRM pendant qu'elle tape
            const textAfterFace = faceManager.parseAndCleanText(streamedText);
            const { cleanText: liveClean } = parseTags(textAfterFace);

            if (loadingMessage) {
                loadingMessage.innerHTML = '<strong>M:</strong> ' + escapeHTML(liveClean);
                scrollToBottom();
            }
            updateMiniWidget(liveClean, 'assistant');

            // 🎯 Détection de fin de phrase valide (hors des actions *...*)
            while (true) {
                // Recherche toutes les ponctuations de fin de phrase
                const regex = /[.!?\n]+/g;
                let matchExec;
                let validCutIndex = -1;

                while ((matchExec = regex.exec(sentenceBuffer)) !== null) {
                    const textBeforePunct = sentenceBuffer.slice(0, matchExec.index);
                    const countAsterisks = (textBeforePunct.match(/\*/g) || []).length;

                    // Si le nombre d'astérisques avant la ponctuation est pair, la coupe est valide
                    if (countAsterisks % 2 === 0) {
                        validCutIndex = matchExec.index + matchExec[0].length;
                        break;
                    }
                }

                // Aucune fin de phrase valide trouvée pour le moment
                if (validCutIndex === -1) break;

                // Découpage de la phrase complète
                const completeSentence = sentenceBuffer.slice(0, validCutIndex);
                sentenceBuffer = sentenceBuffer.slice(validCutIndex);

                // Nettoyage des tags pour le TTS
                const cleanSentence = parseTags(faceManager.parseAndCleanText(completeSentence)).cleanText;

                if (cleanSentence.trim()) {
                    SpeechManager.enqueueSentence(cleanSentence);
                }
            }
        };

        const rawAiResponse = await sendMessageToLLM(
            textToSend, 
            historyMessages, 
            screenImage,
            handleToken,
            0,
            null,
            currentLLmAbortController.signal
        );

        // 🎯 Envoie le reste du texte (la dernière phrase, qui n'a pas forcément de ponctuation finale)
        if (sentenceBuffer.trim()) {
            const cleanRemaining = parseTags(faceManager.parseAndCleanText(sentenceBuffer)).cleanText;
            if (cleanRemaining.trim()) {
                SpeechManager.enqueueSentence(cleanRemaining);
            }
        }
        
        // 🎭 Analyse du message pour déclencher l'animation VRM
        if (typeof window.checkAndTriggerChatAnimation === 'function') {
            window.checkAndTriggerChatAnimation(`${textToSend} ${rawAiResponse}`);
        }

        const textAfterFaceTags = faceManager.parseAndCleanText(rawAiResponse);
        const { cleanText } = parseTags(textAfterFaceTags);

        if (loadingMessage) {
            loadingMessage.innerHTML = '<strong>M:</strong> ' + escapeHTML(cleanText);
            scrollToBottom();
        }

        updateMiniWidget(cleanText, 'assistant');

        await saveMessageToCurrentChat('assistant', cleanText);
        await renderHistoryList();

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Requête LLM annulée par l'utilisateur.");
        } else {
            const errTxt = `Erreur: ${error.message || 'Impossible de contacter le serveur LLM'}`;
            appendMessage(errTxt, 'llm');
            updateMiniWidget(errTxt, 'assistant');
        }

    } finally {
        isSending = false;
        window.isSending = false;

        // 🤖 L'IA a terminé sa réponse, on relance la surveillance d'inactivité
        setLLMBusyState(false);

        scrollToBottom();
    }
}

// 🪟 GESTION SÉCURISÉE DES BOUTONS DE FENÊTRE TAURI
async function initWindowControls() {
    const btnMin = document.getElementById('btn-win-minimize');
    const btnMax = document.getElementById('btn-win-maximize');
    const btnClose = document.getElementById('btn-win-close');

    if (!btnMin && !btnMax && !btnClose) return;

    let appWindow = null;

    if (window.__TAURI__ && window.__TAURI__.window) {
        if (typeof window.__TAURI__.window.getCurrentWindow === 'function') {
            appWindow = window.__TAURI__.window.getCurrentWindow();
        } else if (window.__TAURI__.window.appWindow) {
            appWindow = window.__TAURI__.window.appWindow;
        }
    }

    if (appWindow) {

        // 🖼️ Icône Maya dans la fenêtre / barre des tâches Windows
        try {
            if (typeof appWindow.setIcon === 'function') {
                await appWindow.setIcon('src-tauri/icons/icon.ico');
                console.log('✅ Icône Maya appliquée à la fenêtre.');
            }
        } catch (error) {
            console.warn('⚠️ Impossible d’appliquer l’icône Maya :', error);
        }

        if (btnMin) {
            btnMin.addEventListener('click', () => {
                appWindow.minimize();
            });
        }

        if (btnMax) {
            btnMax.addEventListener('click', async () => {
                const isMax = await appWindow.isMaximized();

                if (isMax) {
                    await appWindow.unmaximize();
                } else {
                    await appWindow.maximize();
                }
            });
        }

        if (btnClose) {
            btnClose.addEventListener('click', () => {
                appWindow.close();
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    screenManager = new ScreenManager();
    window.screenManager = screenManager;

    await loadCustomPersona();

    const sendBtn = document.getElementById('send-btn') || document.querySelector('.chat-input button');
    const userInput = document.getElementById('user-input');
    const miniInput = document.getElementById('mini-user-input');
    const btnMic = document.getElementById('btn-mic');
    const btnContinue = document.getElementById('btn-continue');
    const btnStop = document.getElementById('btn-stop');
    const btnScreenshot = document.getElementById('btn-screenshot');

    updateMicUI(false);

    if (btnMic) btnMic.addEventListener('click', toggleMicrophone);
    if (btnContinue) btnContinue.addEventListener('click', handleContinue);
    if (btnStop) btnStop.addEventListener('click', stopAll);

    if (btnScreenshot) {
        btnScreenshot.addEventListener('click', () => {
            if (screenManager) screenManager.toggleScreenShare();
        });
    }

    checkMayaHubStatus();
    setupMemoryMaintenancePopup(); 

    initHistoryUI(
        (chat) => loadChatIntoUI(chat),
        () => clearChatUI()
    );

    initOptionsUI();
    initBgUI();
    initAutoLearningUI();

    // 🤖 Charge la config backend pour le Mode Actif & démarre le timer
    await loadActiveModeSettings();
    resetInactivityTimer();

    // 🤖 Réinitialisation du timer d'inactivité sur interaction
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);

    initWindowControls();

    const currentChat = await getCurrentChat();

    if (currentChat) {
        loadChatIntoUI(currentChat);
    }

    await renderHistoryList();

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    if (userInput) {
        userInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        userInput.addEventListener('input', resetInactivityTimer);
    }

    if (miniInput) {
        // 🤖 Réinitialise le délai si écrit sur le mini widget (l'envoi est géré par index.html)
        miniInput.addEventListener('input', resetInactivityTimer);
    }

    // Écouteur d'événement sécurisé avec anti-rebond (400ms)
    window.addEventListener('vrm:playAnimation', (e) => {
        const animName = e.detail?.animation;

        if (!animName) return;

        const now = Date.now();

        if (now - lastAnimationTriggerTime < 400) {
            return;
        }

        lastAnimationTriggerTime = now;

        console.log("Animation VRM déclenchée depuis le menu contextuel :", animName);

        if (typeof window.playVRMAnimation === 'function') {
            window.playVRMAnimation(animName);
        }
    });
});

function setupMemoryMaintenancePopup() {
    const el = document.createElement('div');
    el.id = 'memory-maintenance-popup';
    el.style.cssText = `
        display:none; position:fixed; bottom:20px; left:20px; z-index:9999;
        background:#1e1e2e; color:#f2f2f2; border-radius:10px;
        padding:14px 18px; max-width:280px;
        box-shadow:0 4px 16px rgba(0,0,0,0.35); font-size:13px;
    `;
    el.innerHTML = `
    <div style="font-weight:600; margin-bottom:4px;">🧠 Mémoire en cours de consolidation</div>
    <div style="color:#a6adc8; margin-bottom:8px;">Merci de ne pas interagir avec votre IA</div>
    <div style="height:4px; background:#313244; border-radius:2px; overflow:hidden;">
        <div style="width:40%; height:100%; background:#89b4fa; border-radius:2px; animation:memProgress 1.4s ease-in-out infinite;"></div>
    </div>
    <style>
        @keyframes memProgress {
            0%   { transform: translateX(-100%); }
            100% { transform: translateX(250%); }
        }
    </style>
    `;
    document.body.appendChild(el);

    setInterval(async () => {
        try {
            const res = await fetch('http://127.0.0.1:5005/api/memory/status');
            const data = await res.json();
            el.style.display = data.state === 'maintenance' ? 'block' : 'none';
        } catch (err) { /* Hub injoignable, on ignore silencieusement */ }
    }, 2000);
}
// ============================================================
// 🧩 POPUP "MODÈLE LLM MANQUANT"
// Réutilisable depuis n'importe quel fichier (ex: optionsUI.js) via
// window.showModelMissingPopup(). S'affiche tant que l'utilisateur
// ne l'a pas fermée manuellement (pas de disparition automatique).
// ============================================================
window.showModelMissingPopup = function showModelMissingPopup() {
    if (document.getElementById('model-missing-popup')) return; // déjà affiché

    const el = document.createElement('div');
    el.id = 'model-missing-popup';
    el.style.cssText = `
        display:block; position:fixed; bottom:20px; left:20px; z-index:9999;
        background:#1e1e2e; color:#f2f2f2; border-radius:10px;
        padding:14px 18px; max-width:320px;
        box-shadow:0 4px 16px rgba(0,0,0,0.35); font-size:13px;
    `;
    el.innerHTML = `
    <div style="font-weight:600; margin-bottom:6px;">⚠️ Aucun modèle LLM chargé</div>
    <div style="color:#a6adc8; margin-bottom:10px;">
        Merci de placer un modèle LLM dans le dossier "model GGUF" là où est installée
        l'interface M.A.Y.A, appuyer sur F5 pour actualiser, puis de le sélectionner dans les options.
    </div>
    <button id="model-missing-popup-close" style="
        background:#89b4fa; color:#1e1e2e; border:none; border-radius:6px;
        padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer;
    ">Compris</button>
    `;
    document.body.appendChild(el);

    document.getElementById('model-missing-popup-close').addEventListener('click', () => {
        el.remove();
    });
};

// ============================================================
// ❌ ANCIEN "FIX" RETIRÉ : ce bloc faisait tourner un second
// setInterval (80ms) qui appelait invoke('update_hit_test', ...)
// EN PERMANENCE (même overlay désactivé, sans jamais vérifier
// isOverlayMode), avec sa propre liste de rects, en concurrence
// directe avec le hit-test de index.html (40ms, qui lui vérifie
// bien isOverlayMode). Les deux écrasaient alternativement le
// calcul de zones cliquables côté Rust, ce qui provoquait un état
// dedans/dehors instable même souris immobile — c'était la cause
// du blocage du mode overlay après un clic ailleurs.
// Le hit-test de index.html reste l'unique système en place.
// ============================================================