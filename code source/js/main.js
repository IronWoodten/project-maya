import { sendMessageToLLM, setDocContext, clearDocContext } from './llm.js';
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
import { initGamesUI } from './gamesUI.js';
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

// 🛡️ Anti-faux-déclenchement : un bruit isolé ne doit plus couper Maya
const BARGE_IN_THRESHOLD = 30;  // volume à dépasser pour interrompre Maya PENDANT qu'elle parle (anti-écho/bruit)
const BARGE_IN_TICKS = 4;       // nombre de mesures (x100 ms) consécutives au-dessus du seuil : 4 = 400 ms de voix soutenue
const SPEECH_START_TICKS = 2;   // quand Maya se tait : 2 mesures (200 ms) pour considérer que tu parles (ignore les clics)
let loudTicks = 0;

function isMayaSpeaking() {
    return !!(SpeechManager.currentAudio || SpeechManager.activeAbortController || SpeechManager.isProcessingQueue);
}

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
        const prefix = sender === 'user' ? 'Vous: ' : (sender === 'event' ? '⏱️ ' : 'Maya: ');
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

            // Pendant que Maya parle, on exige un volume plus fort ET soutenu (son propre écho
            // ou un bruit ne doivent pas l'interrompre ni être envoyés au STT)
            const mayaSpeaking = isMayaSpeaking();
            const threshold = mayaSpeaking ? BARGE_IN_THRESHOLD : SILENCE_THRESHOLD;
            const ticksNeeded = mayaSpeaking ? BARGE_IN_TICKS : SPEECH_START_TICKS;

            if (window.DEBUG_MIC) console.log(`🎚️ vol=${averageVolume.toFixed(1)} seuil=${threshold} ticks=${loudTicks} mayaParle=${mayaSpeaking}`);

            if (averageVolume > threshold) {
                loudTicks++;
                // Voix confirmée, ou tu es déjà en train de parler (on ne re-vérifie pas à chaque micro-pause)
                const confirmed = loudTicks >= ticksNeeded || (hasSpokenInSlice && !mayaSpeaking);
                if (confirmed) {
                    lastSoundDetectedTime = Date.now();
                    hasSpokenInSlice = true;
                    if (mayaSpeaking) {
                        console.log("🎤 Interruption confirmée (voix soutenue) -> Maya se tait.");
                        SpeechManager.stop();
                    }
                }
            } else {
                loudTicks = 0;
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
    loudTicks = 0;

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

    // 🤖 Pause du mode actif pendant la transcription (peut être longue si le GPU est saturé)
    setLLMBusyState(true);

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
    } catch (err) {
    } finally {
        setLLMBusyState(false);
    }
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

// --- DIODES D'ÉTAT : hub / llm / stt / tts ---
const SVC_LABELS = {
    hub: 'Hub Maya (port 5005)',
    llm: 'LLM (llama-server)',
    stt: 'STT (Whisper)',
    tts: 'TTS (voix)'
};
const SVC_STATE_TEXT = { ok: 'prêt', loading: 'chargement en cours…', down: 'hors ligne' };
const svcShown = {};      // dernier état affiché par service
const svcFailStreak = {}; // échecs consécutifs (évite un clignotement sur un ping raté)
let mcpConnected = false;

function setServiceLed(name, state) {
    const led = document.querySelector(`.svc-led[data-svc="${name}"]`);
    if (!led) return;
    led.dataset.state = state;
    led.title = `${SVC_LABELS[name]} : ${SVC_STATE_TEXT[state]}`;
    svcShown[name] = state;
}

async function refreshServiceLeds() {
    let data = null;
    try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (res.ok) data = await res.json();
    } catch (err) { /* serveur Node injoignable */ }

    let allReady = true;

    for (const name of Object.keys(SVC_LABELS)) {
        const incoming = data ? data[name] : 'down';

        if (incoming === 'down' && svcShown[name] === 'ok') {
            // Un service prêt ne passe en rouge qu'après 2 échecs d'affilée
            svcFailStreak[name] = (svcFailStreak[name] || 0) + 1;
            if (svcFailStreak[name] < 2) { allReady = false; continue; }
        } else {
            svcFailStreak[name] = 0;
        }

        if (svcShown[name] !== incoming) setServiceLed(name, incoming);
        if (incoming !== 'ok') allReady = false;
    }

    // Le hub a démarré après la première tentative de connexion MCP (PC lent) : on réessaie
    if (!mcpConnected && svcShown.hub === 'ok') {
        try {
            mcpConnected = !!(await mayaMCP.connect());
        } catch (err) { /* nouvel essai au prochain passage */ }
    }

    // Rafraîchissement rapide pendant le chargement, plus calme ensuite
    setTimeout(refreshServiceLeds, allReady ? 15000 : 2000);
}

async function checkMayaHubStatus() {
    try {
        mcpConnected = !!(await mayaMCP.connect());
    } catch (err) {
        mcpConnected = false;
    }

    refreshServiceLeds();
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

    const prefix = sender === 'user' ? 'U' : (sender === 'event' ? '⏱️' : 'M');

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

// 🎮 Mode donjon : renvoie true si le texte a été relayé au jeu (campagne ouverte et "Parler au jeu" activé).
// Échappatoires pour parler normalement à Maya : commencer par "hors jeu", "pause", "(" ou "!",
// ou désactiver "Parler au jeu" dans la fenêtre du jeu.
async function routeToDungeonIfActive(text) {
    if (/^\s*(hors[ -]?jeu|pause\b|\(|!)/i.test(text)) return false;
    try {
        const st = await (await fetch('/api/dungeon-state')).json();
        if (!st.active || !st.intercept) return false;
        const r = await fetch('/api/dungeon-input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        return r.ok;
    } catch (e) {
        return false;
    }
}

// 📎 DOCUMENTS -> FICHES DE CONNAISSANCE
// Le trombone choisit des fichiers ; rien ne part tant que tu n'appuies pas sur Envoyer.
// - Message vide + document(s) : Maya fait seulement la fiche (icône qui tourne, puis ✓, puis une courte confirmation affichée mais non enregistrée).
// - Message + document(s) : Maya répond en s'appuyant sur le document (pour cette réponse seulement), puis fait la fiche.
// Le texte brut du document n'entre jamais dans l'historique du chat ni dans le journal.
const DOCS_API = 'http://127.0.0.1:5005/api/docs';
const DOC_EXTS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json'];
const DOC_MAX_FILES = 5;
const DOC_MAX_BYTES = 20 * 1024 * 1024;
const DOC_ICON_TITLE = 'Envoyer un document à Maya (PDF, DOCX, TXT…) : elle en fait une fiche de connaissance permanente';
let pendingDocs = [];
let docJobsRunning = 0;
let docIconTimer = null;

function docSetIcon(state, tooltip) {
    const btn = document.getElementById('btn-attach-doc');
    const icon = btn ? btn.querySelector('i') : null;
    if (!icon) return;
    clearTimeout(docIconTimer);
    const classes = {
        idle: 'fa-solid fa-paperclip',
        busy: 'fa-solid fa-spinner fa-spin',
        ok: 'fa-solid fa-check',
        error: 'fa-solid fa-triangle-exclamation'
    };
    icon.className = classes[state] || classes.idle;
    btn.title = tooltip || DOC_ICON_TITLE;
    if (state === 'ok' || state === 'error') {
        docIconTimer = setTimeout(() => docSetIcon(docJobsRunning > 0 ? 'busy' : 'idle', docJobsRunning > 0 ? 'Maya travaille sur un document…' : null), state === 'ok' ? 3000 : 6000);
    }
}

// Petit message dans la fenêtre de chat (comme la confirmation de la disquette) : affiché, jamais enregistré.
function docNotice(text, isError) {
    const chatBody = document.getElementById('chat-body');
    if (!chatBody) return;
    const div = document.createElement('div');
    div.className = 'assistant';
    div.textContent = text;
    if (isError) div.style.color = '#f38ba8';
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function renderPendingDocs() {
    const box = document.getElementById('doc-pending-container');
    if (!box) return;
    box.innerHTML = '';
    box.style.display = pendingDocs.length ? 'flex' : 'none';
    pendingDocs.forEach((file, i) => {
        const chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#313244;border:1px solid #45475a;border-radius:12px;padding:2px 8px;max-width:100%;';
        const label = document.createElement('span');
        label.textContent = '📎 ' + file.name;
        label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;';
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = '✕';
        x.title = 'Retirer ce document';
        x.style.cssText = 'background:none;border:none;color:#a6adc8;cursor:pointer;padding:0;';
        x.addEventListener('click', () => { pendingDocs.splice(i, 1); renderPendingDocs(); });
        chip.appendChild(label);
        chip.appendChild(x);
        box.appendChild(chip);
    });
}

function addPendingDocs(fileList) {
    for (const file of Array.from(fileList || [])) {
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        if (!DOC_EXTS.includes(ext)) { docNotice(`⚠️ « ${file.name} » ignoré : format non pris en charge (PDF, DOCX, TXT, MD, CSV, JSON).`, true); continue; }
        if (file.size > DOC_MAX_BYTES) { docNotice(`⚠️ « ${file.name} » ignoré : fichier trop gros (20 Mo maximum).`, true); continue; }
        if (pendingDocs.length >= DOC_MAX_FILES) { docNotice(`⚠️ ${DOC_MAX_FILES} documents maximum à la fois.`, true); break; }
        if (pendingDocs.some(f => f.name === file.name && f.size === file.size)) continue;
        pendingDocs.push(file);
    }
    renderPendingDocs();
}

function initDocUpload() {
    const btn = document.getElementById('btn-attach-doc');
    const input = document.getElementById('doc-file-input');
    if (!btn || !input) return;
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { addPendingDocs(input.files); input.value = ''; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDocUpload);
else initDocUpload();

// Envoie les fichiers au Hub (extraction du texte, sans LLM). Les documents restent en attente tant que ça échoue.
async function docIngest(files, wantText) {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f, f.name));
    fd.append('want_text', wantText ? '1' : '0');
    fd.append('auto_start', wantText ? '0' : '1');
    let res;
    try {
        res = await fetch(DOCS_API + '/ingest', { method: 'POST', body: fd });
    } catch (e) {
        return { ok: false, error: 'le Hub de Maya ne répond pas (il est peut-être coupé)' };
    }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data || !data.ok) return { ok: false, error: (data && data.error) || `erreur du Hub (${res.status})` };
    (data.errors || []).forEach(er => docNotice(`⚠️ « ${er.name} » ignoré : ${er.error}`, true));
    return data;
}

// Suit le travail du Hub : icône qui tourne, puis ✓ + confirmation courte, ou ✗ + raison.
async function docWatchJob(jobId) {
    docJobsRunning++;
    docSetIcon('busy', 'Maya travaille sur un document…');
    let success = false;
    const t0 = Date.now();
    let fails = 0;
    try {
        while (true) {
            await new Promise(r => setTimeout(r, 1000));
            if (Date.now() - t0 > 10 * 60 * 1000) throw new Error('délai dépassé (10 minutes)');
            let data;
            try {
                const r = await fetch(`${DOCS_API}/status/${jobId}`);
                data = await r.json();
                fails = 0;
            } catch (e) {
                if (++fails >= 4) throw new Error('le Hub de Maya ne répond plus (coupé pendant le travail ?)');
                continue;
            }
            if (data.state === 'done') { docNotice('📎 ' + data.message, false); success = true; break; }
            if (data.state === 'error') throw new Error(data.message || 'échec');
            if (data.state === 'unknown') throw new Error(data.message || 'travail perdu');
        }
    } catch (e) {
        docNotice('⚠️ Fiche non enregistrée : ' + e.message, true);
        docJobsRunning--;
        docSetIcon('error', 'Fiche non enregistrée : ' + e.message);
        return false;
    }
    docJobsRunning--;
    docSetIcon('ok', 'Fiche enregistrée');
    return success;
}

// Cas 1 : message vide + document(s) -> fiche seulement.
async function docIngestOnly() {
    const files = pendingDocs.slice();
    docSetIcon('busy', 'Envoi du document à Maya…');
    const r = await docIngest(files, false);
    if (!r.ok) {
        docNotice('⚠️ Document non envoyé : ' + r.error, true);
        docSetIcon('error', 'Document non envoyé : ' + r.error);
        return;  // les documents restent en attente : tu peux réessayer
    }
    pendingDocs = [];
    renderPendingDocs();
    docWatchJob(r.job_id);
}

// Cas 2 : message + document(s) -> le texte est rendu à main.js pour CETTE réponse ; la fiche se fait après.
async function docPrepareForChat() {
    const files = pendingDocs.slice();
    docSetIcon('busy', 'Maya lit le document…');
    const r = await docIngest(files, true);
    if (!r.ok) {
        docNotice('⚠️ Document non envoyé, ton message est conservé : ' + r.error, true);
        docSetIcon('error', 'Document non envoyé : ' + r.error);
        return null;
    }
    pendingDocs = [];
    renderPendingDocs();
    docSetIcon(docJobsRunning > 0 ? 'busy' : 'idle');
    return { docs: r.docs, names: r.docs.map(d => d.name), jobId: r.job_id };
}

// Après la réponse de Maya : lancement de la fiche (en arrière-plan, sans bloquer le chat).
async function startDocFiche(payload) {
    try {
        const r = await fetch(DOCS_API + '/start', { method: 'POST', body: JSON.stringify({ job_id: payload.jobId }) });
        if (!r.ok) throw new Error('le Hub a refusé de démarrer la fiche');
    } catch (e) {
        docNotice('⚠️ Fiche non enregistrée : ' + (e.message || 'le Hub ne répond pas'), true);
        docSetIcon('error', 'Fiche non enregistrée');
        return;
    }
    docWatchJob(payload.jobId);
}

async function sendMessage(overrideText = null, options = {}) {
    // Garde de sécurité : sendMessage est aussi utilisée comme handler d'event
    // (sendBtn.addEventListener('click', sendMessage)) — dans ce cas le navigateur
    // passe automatiquement l'objet MouseEvent en 1er argument. Sans cette garde,
    // cet objet serait pris pour un overrideText et casserait tout traitement de
    // texte plus bas (ex: "str.replace is not a function").
    if (typeof overrideText !== 'string') overrideText = null;

    // Pour un événement système (ex: fin de minuteur), on affiche la bulle avec
    // un préfixe distinct (⏱️) au lieu de "U:", pour ne pas laisser croire que
    // c'est l'utilisateur qui a tapé ce texte. Le rôle sauvegardé en historique
    // reste 'user' (c'est ce que l'API attend), seul l'affichage change.
    const displaySender = (options && options.displayAs === 'event') ? 'event' : 'user';

    const userInput = document.getElementById('user-input');
    const miniInput = document.getElementById('mini-user-input');
    
    let text = overrideText || '';

    if (!overrideText && userInput && userInput.value.trim().length > 0) {
        text = userInput.value.trim();
    } else if (!overrideText && miniInput && miniInput.value.trim().length > 0) {
        text = miniInput.value.trim();
    }

    // 🎮 MODE DONJON : si une campagne Station Nyx est ouverte, ce que tu dis/écris est relayé au jeu
    // (qui résout l'action puis fait raconter Maya) au lieu d'aller au LLM. Rien n'est sauvegardé en historique.
    if (displaySender !== 'event' && text && await routeToDungeonIfActive(text)) {
        appendMessage(text, 'user');
        updateMiniWidget(text, 'user');
        if (userInput) userInput.value = '';
        if (miniInput) miniInput.value = '';
        return;
    }

    // 📎 Documents en attente (trombone) : traités ici, avant tout le reste. Rien de leur contenu n'est enregistré.
    let docPayload = null;
    let docToken = null;
    if (displaySender !== 'event' && pendingDocs.length > 0) {
        if (!text) {
            await docIngestOnly();   // message vide : fiche seulement, rien dans le chat
            return;
        }
        docPayload = await docPrepareForChat();
        if (!docPayload) return;     // échec : rien n'est envoyé, ton message et tes documents restent en place
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

        // Un événement système (ex: fin de minuteur) n'est ni affiché ni
        // sauvegardé en historique — le LLM le reçoit uniquement pour cette
        // réponse (passé directement à sendMessageToLLM plus bas), sans
        // jamais transiter par l'historique/le journal/la mémoire de Maya.
        if (displaySender !== 'event') {
            appendMessage(docPayload ? textToSend + '  📎 ' + docPayload.names.join(', ') : textToSend, displaySender);
            updateMiniWidget(textToSend, displaySender);
            await saveMessageToCurrentChat('user', textToSend);
        }

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
                faceManager.parseAndCleanText(completeSentence); // effet de bord visage uniquement

                if (completeSentence.trim()) {
                    SpeechManager.enqueueSentence(completeSentence);
                }
            }
        };

        if (docPayload) docToken = setDocContext(docPayload.docs);
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
            faceManager.parseAndCleanText(sentenceBuffer); // effet de bord visage uniquement
            SpeechManager.enqueueSentence(sentenceBuffer);
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

        // Les narrations du mode donjon (noSave) ne sont pas gardées en historique : elles pollueraient le journal / la mémoire de Maya.
        if (!(options && options.noSave)) {
            await saveMessageToCurrentChat('assistant', cleanText);
        }
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

        // 📎 Le document ne sert que pour CETTE réponse : retiré ici, puis la fiche se fait en arrière-plan.
        if (docToken !== null) clearDocContext(docToken);
        if (docPayload) startDocFiche(docPayload);

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
    showWelcomeIfFirstLaunch();
    setupMemoryMaintenancePopup(); 

    initHistoryUI(
        (chat) => loadChatIntoUI(chat),
        () => clearChatUI()
    );

    initOptionsUI();
    initBgUI();
    initAutoLearningUI();
    initGamesUI();

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
// 👋 POPUP DE BIENVENUE (1er lancement)
// Affiché une seule fois (flag en localStorage). Rappelable à la
// main depuis la console : window.showWelcomePopup()
// ============================================================
const WELCOME_SEEN_KEY = 'maya_welcome_seen_v1';

window.showWelcomePopup = function showWelcomePopup() {
    if (document.getElementById('welcome-popup')) return; // déjà affiché

    const overlay = document.createElement('div');
    overlay.id = 'welcome-popup';
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:10000; display:flex;
        align-items:center; justify-content:center;
        background:rgba(0,0,0,0.6); padding:16px;
    `;

    const step = (n, title, text, highlight = false) => `
        <div style="display:flex; gap:12px; padding:10px 12px; margin-bottom:8px; border-radius:8px;
            background:${highlight ? 'rgba(249,226,175,0.12)' : '#262637'};
            border:1px solid ${highlight ? '#f9e2af' : 'transparent'};">
            <div style="flex:0 0 24px; height:24px; border-radius:50%; background:${highlight ? '#f9e2af' : '#89b4fa'};
                color:#1e1e2e; font-weight:700; font-size:12px; display:flex; align-items:center; justify-content:center;">${n}</div>
            <div>
                <div style="font-weight:600; margin-bottom:3px;">${title}</div>
                <div style="color:#a6adc8; line-height:1.45;">${text}</div>
            </div>
        </div>`;

    overlay.innerHTML = `
    <div style="background:#1e1e2e; color:#f2f2f2; border-radius:12px; padding:20px 22px;
        width:100%; max-width:520px; max-height:88vh; overflow-y:auto;
        box-shadow:0 8px 32px rgba(0,0,0,0.5); font-size:13px;">
        <div style="font-size:17px; font-weight:700; margin-bottom:4px;">👋 Bienvenue sur M.A.Y.A</div>
        <div style="color:#a6adc8; margin-bottom:14px;">Quelques repères avant de commencer :</div>

        ${step(1, '🧠 Choisis ton LLM',
            'Place un modèle dans le dossier <b>"model GGUF"</b> (un dossier par modèle, avec son mmproj pour la vision), appuie sur <b>F5</b>, puis sélectionne-le dans ⚙️ Paramètres → <b>LLM / Cerveau & Vision</b>.')}

        ${step(2, '🗣️ Choisis ta voix',
            'Dans ⚙️ Paramètres → <b>Voix</b> : voix de synthèse et vitesse de lecture.')}

        ${step(3, '🎤 Parle ou écris',
            'Écris dans la zone de texte, ou clique sur le micro 🎤 pour parler à Maya. Les autres boutons sous le chat servent à la faire continuer, l\'interrompre, partager une capture d\'écran, jouer, ou passer en mode Desktop Pet.')}

        ${step(4, '💾 Sauvegarde à la fin de CHAQUE session',
            '<b style="color:#f9e2af;">C\'est le plus important.</b> Avant de fermer, clique sur l\'icône disquette <i class="fa-solid fa-floppy-disk"></i> (💾) sous le chat : elle enregistre la conversation et le journal de Maya. Sans ça, Maya oublie ce que vous avez vécu pendant la session.', true)}

        ${step(5, '🟢 Les diodes sous le nom',
            '<b>hub</b>, <b>llm</b>, <b>stt</b>, <b>tts</b> : rouge = hors ligne, orange = chargement, vert = prêt. Sur un PC plus lent, le LLM peut mettre un moment : attends qu\'il soit vert avant d\'écrire.')}

        <div style="text-align:right; margin-top:14px;">
            <button id="welcome-popup-close" style="
                background:#89b4fa; color:#1e1e2e; border:none; border-radius:6px;
                padding:8px 18px; font-size:13px; font-weight:600; cursor:pointer;
            ">Compris, c'est parti !</button>
        </div>
    </div>`;

    document.body.appendChild(overlay);

    document.getElementById('welcome-popup-close').addEventListener('click', () => {
        try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch (e) { /* stockage indisponible */ }
        overlay.remove();
    });
};

function showWelcomeIfFirstLaunch() {
    let seen = false;
    try { seen = localStorage.getItem(WELCOME_SEEN_KEY) === '1'; } catch (e) { /* on affichera */ }
    if (!seen) window.showWelcomePopup();
}

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

// ============================================================
// ⏱️ POLLING DES ÉVÉNEMENTS TIMER
// Le plugin "timer" du Hub spawn une fenêtre pywebview séparée
// (timer_popup.py) qui, à la fin du décompte, POST directement
// sur /api/timer-finished (route ajoutée dans server.js). Ici on
// vide cette petite queue à intervalle régulier, et pour chaque
// événement reçu on déclenche un tour de conversation "à froid"
// via sendMessage(), exactement comme si l'utilisateur avait tapé
// le fait brut — c'est le LLM qui formule sa réaction lui-même.
// ============================================================
const TIMER_POLL_MS = 3000;

async function pollTimerEvents() {
    try {
        const res = await fetch('/api/timer-finished');
        const data = await res.json();
        for (const evt of (data.pending || [])) {
            const eventText = evt.message
                ? evt.message
                : `(Ceci est un événement système, pas un message de l'utilisateur.) ` +
                  `Le minuteur "${evt.label}" vient de se terminer. Réagis naturellement, ` +
                  `comme si tu venais de t'en apercevoir toi-même. Ne mentionne aucun bug, ` +
                  `erreur ou problème technique — ce n'est pas le sujet.`;
            await sendMessage(eventText, { displayAs: 'event' });
        }
    } catch (e) {
        console.error('[TimerPoll] erreur :', e);
    } finally {
        setTimeout(pollTimerEvents, TIMER_POLL_MS);
    }
}
pollTimerEvents();

// ============================================================
// 🎮 POLLING DES ÉVÉNEMENTS DE JEU (Puissance 4, etc.)
// ============================================================
const GAME_POLL_MS = 500;
const GAME_EVENT_MAX_AGE_MS = 20000;
let lastMayaBusyAt = 0;

function isMayaBusy() {
    return window.isSending === true ||
           !!(SpeechManager.currentAudio || SpeechManager.activeAbortController);
}

async function pollGameEvents() {
    try {
        if (isMayaBusy()) {
            lastMayaBusyAt = Date.now();
        } else if (Date.now() - lastMayaBusyAt > 700) {
            const res = await fetch('/api/game-event');
            const data = await res.json();
            const now = Date.now();
            const fresh = (data.pending || []).filter(e =>
                e.priority === 'critical' || (now - (e.ts || now)) <= GAME_EVENT_MAX_AGE_MS);
            if (fresh.length > 0) {
                const criticals = fresh.filter(e => e.priority === 'critical');
                const evt = criticals.length > 0 ? criticals[criticals.length - 1] : fresh[fresh.length - 1];
                await sendMessage(evt.message, { displayAs: 'event', noSave: !!evt.nosave });
            }
        }
    } catch (e) {
        console.error('[GamePoll] erreur :', e);
    } finally {
        setTimeout(pollGameEvents, GAME_POLL_MS);
    }
}
pollGameEvents();
