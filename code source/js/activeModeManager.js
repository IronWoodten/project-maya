import { sendMessageToLLM } from './llm.js';
import { SpeechManager } from './SpeechManager.js';
import { parseTags } from './vrm.js';
import { getCurrentChatMessages, saveMessageToCurrentChat } from './chatHistory.js';
import { renderHistoryList } from './historyUI.js';
import { faceManager, screenManager } from './main.js';

let inactivityTimer = null;
let inactivityDelay = 30; // Valeur par défaut en secondes
let isActifMode = true;   // Activé par défaut pour éviter qu'il reste muet si l'API met du temps
let isLLMBusy = false;

// Sécurité : nombre maximal de relances consécutives
let consecutiveRelances = 0;
const MAX_CONSECUTIVE_RELANCES = 5;

/**
 * Charge les paramètres du mode actif depuis le serveur
 */
export async function loadActiveModeSettings() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const config = await res.json();
            isActifMode = config.interaction_mode === 'actif';
            inactivityDelay = parseInt(config.inactivity_delay, 10) || 30;
            console.log(`⚙️ [Mode Actif] Config chargée : Actif = ${isActifMode}, Délai = ${inactivityDelay}s`);
        }
    } catch (err) {
        console.warn("⚠️ Impossible de charger la config du mode actif, mode actif forcé par défaut.");
    }
    // Lance un premier décompte dès le chargement de la config
    resetInactivityTimer();
}

/**
 * Définit si l'IA est occupée pour suspendre/relancer le timer
 */
export function setLLMBusyState(busy) {
    isLLMBusy = busy;
    console.log(`🧠 [Mode Actif] État IA : ${busy ? 'Occupée' : 'Disponible'}`);
    if (busy) {
        clearTimeout(inactivityTimer);
    } else {
        resetInactivityTimer();
    }
}

/**
 * Réinitialise le timer d'inactivité
 */
export function resetInactivityTimer() {
    clearTimeout(inactivityTimer);

    if (!isActifMode) {
        console.log("⏸️ [Mode Actif] Timer ignoré : Le mode actif est désactivé (isActifMode = false).");
        return;
    }

    if (isLLMBusy) {
        console.log("⏸️ [Mode Actif] Timer ignoré : L'IA est déjà occupée à parler ou réfléchir.");
        return;
    }

    console.log(`⏱️ [Mode Actif] Décompte lancé : relance dans ${inactivityDelay} secondes...`);

    inactivityTimer = setTimeout(() => {
        triggerInactivityFollowUp();
    }, inactivityDelay * 1000);
}

/**
 * Réinitialise manuellement le compteur de relanches quand l'utilisateur parle
 */
export function resetRelanceCount() {
    consecutiveRelances = 0;
    console.log("🔄 [Mode Actif] Compteur de relances remis à zéro par l'utilisateur.");
}

/**
 * Déclenche la relance intelligente par le LLM
 */
async function triggerInactivityFollowUp() {
    if (isLLMBusy || !isActifMode) return;

    if (consecutiveRelances >= MAX_CONSECUTIVE_RELANCES) {
        console.log("🛑 [Mode Actif] Nombre max de relanches atteint (5/5). En attente de l'utilisateur.");
        return;
    }

    console.log(`📢 [Mode Actif] Délai d'inactivité atteint ! Relance ${consecutiveRelances + 1}/${MAX_CONSECUTIVE_RELANCES} en cours...`);
    setLLMBusyState(true);
    consecutiveRelances++;

    try {
        let screenImage = null;
        if (screenManager && typeof screenManager.isActive === 'function' && screenManager.isActive()) {
            try {
                screenImage = await screenManager.captureFrame();
                console.log("👁️ [Mode Actif] Capture d'écran jointe à la relance.");
            } catch (err) {
                console.warn("⚠️ Échec de la capture d'écran :", err);
            }
        }

        const systemRelancePrompt = `[SYSTEM INSTRUCTION: L'utilisateur n'a pas répondu depuis ${inactivityDelay} secondes. 
C'est ta relance n°${consecutiveRelances} sur ${MAX_CONSECUTIVE_RELANCES}.
Sois naturelle et spontanée. 
- Si une capture d'écran est fournie, commente ce qui s'y trouve.
- Sinon, rebondis sur le dernier sujet ou pose une question ouverte.
- Si c'est la relance n°${MAX_CONSECUTIVE_RELANCES}, indique gentiment que tu le laisses tranquille pour le moment.
- Ne répète JAMAIS 'Coucou tu es là' ou des phrases génériques.]`;

        const historyMessages = await getCurrentChatMessages();
        const rawAiResponse = await sendMessageToLLM(systemRelancePrompt, historyMessages, screenImage);

        if (typeof window.checkAndTriggerChatAnimation === 'function') {
            window.checkAndTriggerChatAnimation(rawAiResponse);
        }

        const textAfterFaceTags = faceManager.parseAndCleanText(rawAiResponse);
        const { cleanText } = parseTags(textAfterFaceTags);

        const chatBody = document.getElementById('chat-body');
        if (chatBody) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message llm';
            msgDiv.innerHTML = `<strong>M:</strong> ${cleanText}`;
            chatBody.appendChild(msgDiv);
            chatBody.scrollTop = chatBody.scrollHeight;
        }

        await saveMessageToCurrentChat('assistant', cleanText);
        if (typeof renderHistoryList === 'function') await renderHistoryList();

        await SpeechManager.speak(cleanText);

    } catch (error) {
        console.error("❌ Erreur lors de la relance automatique :", error);
    } finally {
        setLLMBusyState(false);
    }
}