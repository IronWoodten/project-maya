/**
 * SpeechManager.js
 * Orchestre la parole du personnage en synchronisant les émotions, le TTS et le Lip-Sync.
 */

import { setupAudioLipSync, resetExpressions, resetToIdle, triggerEmotion } from './vrm.js';
import { EmotionEngine } from './EmotionEngine.js';

const emotionEngine = new EmotionEngine();

/**
 * Assainit et encode une chaîne pour une URL en supprimant les demi-caractères Unicode (surrogates orphelins).
 * Évite les exceptions `URIError: URI malformed` avec encodeURIComponent.
 */
function safeEncode(str) {
    if (!str) return '';
    const wellFormed = typeof str.toWellFormed === 'function'
        ? str.toWellFormed()
        : str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
    return encodeURIComponent(wellFormed);
}

export class SpeechManager {

    static currentAudio = null;
    static isStopped = false;
    static activeAbortController = null;

    // 🎯 File d'attente pour le streaming vocal phrase par phrase
    static sentenceQueue = [];
    static isProcessingQueue = false;

    // 🎭 Empêche de re-déclencher l'émotion (visage + corps) à chaque phrase :
    // une seule émotion est jouée par tour de réponse, sauf reset explicite
    // via startNewResponse().
    static hasTriggeredEmotionForTurn = false;

    /**
     * Stoppe immédiatement toute parole, audio et animation en cours.
     * @param {boolean} keepAnimation - si true, on coupe l'audio/la file mais on NE
     *   force PAS de retour en idle. Utilisé par speak() en interne : puisqu'une
     *   nouvelle émotion va être déclenchée dans la foulée, forcer l'idle ici ne
     *   ferait qu'ajouter un aller-retour idle->talking visible (saccade) pour rien.
     */
    static stop(keepAnimation = false) {
        console.log("🛑 SpeechManager : Interruption forcée !");
        this.isStopped = true;
        this.sentenceQueue = [];
        this.isProcessingQueue = false;

        if (this.activeAbortController) {
            this.activeAbortController.abort();
            this.activeAbortController = null;
        }

        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }

        if (!keepAnimation) {
            resetExpressions();
            resetToIdle();
        }
    }

    /**
     * Réinitialise le flag d'émotion pour un nouveau tour de réponse.
     * À appeler une seule fois au tout début d'une nouvelle réponse LLM,
     * que ce soit via le streaming (enqueueSentence) ou via speak()
     * (activeModeManager.js), pour autoriser à nouveau le déclenchement
     * de triggerEmotion() sur la 1ère phrase de ce nouveau tour.
     */
    static startNewResponse() {
        this.hasTriggeredEmotionForTurn = false;
    }

    /**
     * Reçoit une phrase individuelle du flux LLM (streaming) et l'ajoute à la file.
     */
    static enqueueSentence(sentenceText) {
        if (this.isStopped || !sentenceText.trim()) return;
        this.sentenceQueue.push(sentenceText);
        this.processQueue();
    }

    /**
     * Dépile et lit les phrases une par une, sans chevauchement.
     */
    static async processQueue() {
        if (this.isProcessingQueue || this.sentenceQueue.length === 0 || this.isStopped) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.sentenceQueue.length > 0 && !this.isStopped) {
            const sentence = this.sentenceQueue.shift();
            const steps = emotionEngine.parse(sentence);

            for (const step of steps) {
                if (this.isStopped) break;
                await this._processStep(step);
            }
        }

        this.isProcessingQueue = false;

        if (!this.isStopped && this.sentenceQueue.length === 0) {
            resetToIdle();
        }
    }

    /**
     * Point d'entrée unique : transforme un texte brut en une séquence de parole animée.
     */
    static async speak(text) {
        this.stop(true); // garde l'animation en cours : le 1er step va enchaîner directement
        this.startNewResponse(); // nouveau tour -> ré-autorise le déclenchement d'émotion
        this.isStopped = false;

        console.log("🎙️ SpeechManager : Début de la séquence de parole...");

        const steps = emotionEngine.parse(text);

        for (const step of steps) {
            if (this.isStopped) {
                console.log("🛑 SpeechManager : Séquence interrompue.");
                break;
            }
            await this._processStep(step);
        }

        if (!this.isStopped) {
            console.log("🎙️ SpeechManager : Séquence terminée -> Remise en Idle.");
            resetToIdle();
        }
    }

    /**
     * Gère une seule étape : déclenche l'émotion (visage + corps) puis joue l'audio TTS.
     */
    static async _processStep(step) {
        if (this.isStopped) return;

        console.log(`🔄 Étape : Emotion=[${step.emotion}] Text=[${step.text}]`);

        // A. DÉCLENCHEMENT DE L'ANIMATION CORPS ET VISAGE
        if (step.emotion === 'dance') {
            if (typeof window.playVRMAnimation === 'function') {
                window.playVRMAnimation('dance');
            }
        } else {
            // Transmet l'émotion à vrm.js.
            // Si c'est la même qu'avant (ex: talking -> talking), vrm.js l'ignore automatiquement.
            // Si elle change (ex: kiss -> talking), Maya revient naturellement à la parole.
            triggerEmotion(step.emotion || 'talking');
        }

        // B. NETTOYAGE DU TEXTE POUR LA VOIX (TTS)
        const speakableText = step.text
            .replace(/\*.*?\*/g, '')
            .replace(/[🎶🎵]/gu, '')
            .trim();

        // C. LECTURE AUDIO
        if (!this.isStopped && speakableText.length > 0) {
            await this._callTTS(speakableText);
        }
    }

    /**
     * Appelle le serveur TTS Python et joue l'audio.
     */
    static async _callTTS(text) {
        if (!text || !text.trim() || this.isStopped) return;

        try {
            this.activeAbortController = new AbortController();

            const voiceSelect = document.getElementById('select-tts-voice');
            const engineSelect = document.getElementById('select-tts-engine');
            const langSelect = document.getElementById('select-tts-lang');
            // 🟢 AJOUT : Récupération de l'élément du slider de vitesse
            const speedInput = document.getElementById('tts-speed-slider') || document.getElementById('input-tts-speed') || document.getElementById('tts-speed');

            const voice = voiceSelect ? voiceSelect.value : '';
            const engine = engineSelect ? engineSelect.value : '';
            const lang = langSelect ? langSelect.value : '';
            const speed = speedInput ? speedInput.value : ''; // 🟢 AJOUT

            // Utilisation de safeEncode au lieu de encodeURIComponent directement
            let ttsUrl = `http://localhost:5001/api/tts?text=${safeEncode(text)}`;
            if (voice) ttsUrl += `&voice=${safeEncode(voice)}`;
            if (engine) ttsUrl += `&engine=${safeEncode(engine)}`;
            if (lang) ttsUrl += `&lang=${safeEncode(lang)}`;
            if (speed) ttsUrl += `&speed=${safeEncode(speed)}`; // 🟢 AJOUT : Transmission du paramètre speed

            const response = await fetch(
                ttsUrl,
                { signal: this.activeAbortController.signal }
            );

            if (!response.ok) {
                throw new Error("Erreur de réponse du serveur TTS");
            }

            const audioBlob = await response.blob();
            if (this.isStopped) return;

            const audioUrl = URL.createObjectURL(audioBlob);
            await this._playAudioElement(audioUrl);
            URL.revokeObjectURL(audioUrl);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("🛑 Requête TTS annulée.");
            } else {
                console.error("❌ Erreur SpeechManager (TTS) :", error);
                resetToIdle();
            }
        } finally {
            this.activeAbortController = null;
        }
    }

    /**
     * Joue un fichier audio, active le lip-sync et attend la fin de la phrase.
     */
    static _playAudioElement(url) {
        return new Promise((resolve) => {
            if (this.isStopped) {
                resolve();
                return;
            }

            const audio = new Audio(url);
            this.currentAudio = audio;

            setupAudioLipSync(audio);

            // Cleanup "léger" (fin normale) : on ne touche PAS aux expressions du
            // visage, pour ne pas couper court à l'émotion en cours entre deux
            // phrases du même tour (plus de saccade visage->neutre->visage).
            const cleanup = () => {
                this.currentAudio = null;
            };

            // Cleanup "dur" (interruption/erreur) : on réinitialise bien les
            // expressions, car dans ce cas on ne peut pas garantir qu'une autre
            // étape va enchaîner proprement derrière.
            const cleanupWithReset = () => {
                this.currentAudio = null;
                resetExpressions();
            };

            audio.onended = () => {
                console.log("✅ Fin de l'audio de cette étape.");
                cleanup();
                resolve();
            };

            audio.onerror = (error) => {
                console.error("❌ Erreur de lecture audio :", error);
                cleanupWithReset();
                resetToIdle();
                resolve();
            };

            audio.play().then(() => {
                if (this.isStopped) {
                    audio.pause();
                    cleanupWithReset();
                    resolve();
                }
            }).catch(error => {
                console.error("❌ Erreur au lancement du play() :", error);
                cleanupWithReset();
                resetToIdle();
                resolve();
            });
        });
    }
}