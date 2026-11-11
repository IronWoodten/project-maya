import { sendMessageToLLM } from './llm.js';
import { SpeechManager } from './SpeechManager.js';
import { parseTags } from './vrm.js';
import { getCurrentChatMessages, saveMessageToCurrentChat } from './chatHistory.js';
import { renderHistoryList } from './historyUI.js';
import { faceManager, screenManager } from './main.js';

let inactivityTimer = null;
let inactivityDelay = 30; // Valeur par défaut en secondes
let isActifMode = true;   // Activé par défaut pour éviter qu'il reste muet si l'API met du temps

// ✅ Compteur d'occupation (au lieu d'un simple booléen) : plusieurs traitements
// peuvent se chevaucher (relance + message utilisateur, transcription vocale...).
// Le timer ne repart que lorsque TOUS ont fini.
let busyCount = 0;

// Sécurité : nombre maximal de relances consécutives
let consecutiveRelances = 0;
const MAX_CONSECUTIVE_RELANCES = 5;

// ✅ Gestion de la relance en cours : on peut l'annuler si l'utilisateur parle
let followUpAbortController = null;
let followUpEpoch = 0; // s'incrémente à chaque message utilisateur

// Un dernier message "user" plus récent que ça = réponse du LLM encore attendue
const PENDING_USER_MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;

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
 * Définit si l'IA est occupée pour suspendre/relancer le timer.
 * Chaque appel (true) doit être suivi d'un appel (false) : c'est un compteur.
 */
export function setLLMBusyState(busy) {
    if (busy) {
        busyCount++;
    } else {
        busyCount = Math.max(0, busyCount - 1);
    }
    console.log(`🧠 [Mode Actif] État IA : ${busyCount > 0 ? 'Occupée' : 'Disponible'} (${busyCount})`);
    if (busyCount > 0) {
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

    if (busyCount > 0) {
        console.log("⏸️ [Mode Actif] Timer ignoré : L'IA est déjà occupée à parler ou réfléchir.");
        return;
    }

    console.log(`⏱️ [Mode Actif] Décompte lancé : relance dans ${inactivityDelay} secondes...`);

    inactivityTimer = setTimeout(() => {
        triggerInactivityFollowUp();
    }, inactivityDelay * 1000);
}

/**
 * Appelé par main.js à chaque message de l'utilisateur :
 * remet le compteur de relances à zéro ET annule toute relance en cours
 * (sa réponse serait obsolète et elle ralentirait la vraie réponse sur le GPU).
 */
export function resetRelanceCount() {
    consecutiveRelances = 0;
    followUpEpoch++;
    if (followUpAbortController) {
        followUpAbortController.abort();
        followUpAbortController = null;
    }
    console.log("🔄 [Mode Actif] Compteur de relances remis à zéro par l'utilisateur.");
}

/**
 * Maya est-elle en train de parler (audio en cours ou file TTS active) ?
 * (même test que celui utilisé dans main.js pour les événements du minuteur)
 */
function isMayaSpeaking() {
    return !!(SpeechManager.currentAudio || SpeechManager.activeAbortController);
}

// Dernière fois où on a constaté que Maya parlait (pour mesurer "depuis combien de temps elle s'est tue")
let lastSpeechSeenAt = 0;

/**
 * Vérifie les 3 conditions de la relance, au moment où le timer tombe :
 *   1. le mode actif est activé dans l'interface
 *   2. l'utilisateur n'a rien dit / fait depuis le délai choisi
 *   3. Maya n'a ni généré ni parlé depuis ce même délai (depuis la FIN de sa dernière génération)
 * Et jamais pendant qu'une réponse est en cours de génération.
 *
 * Retourne { ok: true } ou { ok: false, retryInMs } (retryInMs = null : rien à replanifier,
 * le timer sera relancé par setLLMBusyState / resetInactivityTimer).
 */
async function checkFollowUpConditions() {
    const delayMs = inactivityDelay * 1000;
    const now = Date.now();

    // Condition 1 : option active dans l'interface
    if (!isActifMode) return { ok: false, retryInMs: null };

    // Génération en cours (Maya réfléchit) : on ne relance JAMAIS.
    // Le timer repartira tout seul à la fin de la génération (setLLMBusyState(false)).
    if (busyCount > 0) return { ok: false, retryInMs: null };
    if (window.isSending === true) return { ok: false, retryInMs: 2000 };

    // Maya parle encore : on attend qu'elle se taise, puis on recompte le délai complet
    if (isMayaSpeaking()) {
        lastSpeechSeenAt = now;
        return { ok: false, retryInMs: 2000 };
    }
    if (lastSpeechSeenAt > 0 && now - lastSpeechSeenAt < delayMs) {
        return { ok: false, retryInMs: delayMs - (now - lastSpeechSeenAt) + 200 };
    }

    // Conditions 2 et 3 : on se base sur l'historique réel de la conversation
    const history = await getCurrentChatMessages();
    if (Array.isArray(history) && history.length > 0) {
        const last = history[history.length - 1];
        const lastTs = (last && last.timestamp) || 0;
        const age = now - lastTs;

        // Dernier message = celui de l'utilisateur, récent : sa réponse est encore attendue
        // (cas 5 min 30 de génération avec un délai de 5 min) -> on ne relance pas.
        if (last && last.role === 'user' && age < PENDING_USER_MESSAGE_MAX_AGE_MS) {
            return { ok: false, retryInMs: 5000 };
        }

        // Dernier échange (user ou Maya) trop récent : on attend la fin du délai
        if (lastTs > 0 && age < delayMs) {
            return { ok: false, retryInMs: delayMs - age + 200 };
        }
    }

    return { ok: true };
}

/**
 * Déclenche la relance intelligente par le LLM
 */
async function triggerInactivityFollowUp() {
    if (!isActifMode) return;

    if (consecutiveRelances >= MAX_CONSECUTIVE_RELANCES) {
        console.log("🛑 [Mode Actif] Nombre max de relanches atteint (5/5). En attente de l'utilisateur.");
        return;
    }

    const verdict = await checkFollowUpConditions();
    if (!verdict.ok) {
        if (verdict.retryInMs != null) {
            console.log(`⏸️ [Mode Actif] Relance reportée de ${Math.round(verdict.retryInMs / 1000)}s (conditions non remplies).`);
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                triggerInactivityFollowUp();
            }, verdict.retryInMs);
        }
        return;
    }

    // Re-contrôle synchrone juste avant de prendre la main (l'état a pu changer pendant l'await)
    if (busyCount > 0 || window.isSending === true) return;

    console.log(`📢 [Mode Actif] Délai d'inactivité atteint ! Relance ${consecutiveRelances + 1}/${MAX_CONSECUTIVE_RELANCES} en cours...`);
    setLLMBusyState(true);
    consecutiveRelances++;

    const myEpoch = followUpEpoch;
    const myController = new AbortController();
    followUpAbortController = myController;

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

        // L'utilisateur a parlé pendant la capture : on abandonne
        if (myEpoch !== followUpEpoch || window.isSending === true) {
            console.log("🛑 [Mode Actif] Relance annulée : une réponse est en cours ou l'utilisateur a écrit entre-temps.");
            return;
        }

        const systemRelancePrompt = `[SYSTEM INSTRUCTION: L'utilisateur n'a pas répondu depuis ${inactivityDelay} secondes. 
C'est ta relance n°${consecutiveRelances} sur ${MAX_CONSECUTIVE_RELANCES}.
Sois naturelle et spontanée. 
- Si une capture d'écran est fournie, commente ce qui s'y trouve.
- Sinon, rebondis sur le dernier sujet ou pose une question ouverte.
- Si c'est la relance n°${MAX_CONSECUTIVE_RELANCES}, indique gentiment que tu le laisses tranquille pour le moment.
- Ne répète JAMAIS 'Coucou tu es là' ou des phrases génériques.]`;

        const historyMessages = await getCurrentChatMessages();
        const rawAiResponse = await sendMessageToLLM(
            systemRelancePrompt,
            historyMessages,
            screenImage,
            null,
            0,
            null,
            myController.signal
        );

        // ✅ L'utilisateur a parlé pendant que le LLM générait la relance :
        // elle est obsolète, on ne l'affiche pas, ne la sauvegarde pas, ne la dit pas.
        if (myEpoch !== followUpEpoch || myController.signal.aborted) {
            console.log("🛑 [Mode Actif] Relance obsolète ignorée (l'utilisateur a écrit entre-temps).");
            return;
        }

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
        if (error && error.name === 'AbortError') {
            console.log("🛑 [Mode Actif] Relance annulée (AbortError).");
        } else {
            console.error("❌ Erreur lors de la relance automatique :", error);
        }
    } finally {
        if (followUpAbortController === myController) followUpAbortController = null;
        setLLMBusyState(false);
    }
}
