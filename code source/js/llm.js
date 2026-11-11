// js/llm.js

import config from './config.js';
import { getFullSystemPrompt } from './promptManager.js';
import { mayaMCP } from './mcpClient.js';

// Nombre max d'appels d'outils enchaînés avant de forcer une réponse finale.
// Empêche la boucle infinie de function-calling (cf. bug "tourne dans le vide").
const MAX_TOOL_ITERATIONS = 6;

// Garde-fou "pensée sans fin" : nombre max de caractères du canal de pensée du modèle
// (reasoning_content) tolérés avant de couper la génération. Avec enable_thinking=false,
// il ne devrait y en avoir aucun : au-delà, le modèle est parti dans une pensée silencieuse
// (rien d'affiché, rien de parlé) et risque de tourner très longtemps.
const MAX_SILENT_REASONING_CHARS = 1200;

// Garde-fou "flux muet" : on ne coupe QUE si llama-server est réellement en train de générer (il l'indique
// via /slots : des tokens déjà décodés) mais n'a plus rien envoyé de visible (ni texte, ni pensée, ni outil)
// depuis ce délai. Une longue attente AVANT le premier token (gros prompt, jeu qui occupe le GPU...) ne
// déclenche jamais la coupure. En cas de coupure : un seul nouvel essai (sans cache de prompt ; et SANS l'image
// si la requête en avait une, voir plus bas).
const MAX_SILENT_STREAM_MS = 10000;   // silence visible avant de vérifier l'état de llama-server
const MIN_DECODED_FOR_STALL = 50;     // tokens déjà décodés pour considérer que la génération a démarré
const STALL_FALLBACK_MS = 45000;      // si /slots est injoignable : coupure après ce silence (morceaux déjà reçus)
const SILENT_HARD_CAP_MS = 120000;    // filet de sécurité : AUCUN signe de vie pendant 2 minutes (quand le serveur n'envoie pas de progression)
const SILENT_HARD_CAP_IMAGE_MS = 120000; // idem pour une requête AVEC image : au-delà, nouvel essai directement sans l'image
const SILENT_NO_PROGRESS_MS = 240000; // si le serveur envoie la progression du prompt : on ne coupe que s'il n'avance PLUS depuis 4 min
                                      // (llama-server n'envoie un point de progression que tous les 2048 tokens : en jeu, à ~28-60 tokens/s,
                                      //  deux points sont séparés de 35 à 75 s ; mesuré dans stream_debug.log)
const ABSOLUTE_MAX_WAIT_MS = 1800000; // plafond absolu d'une génération sans réponse visible (30 min), même si ça avance
const IDLE_WAIT_MAX_MS = 40000;       // avant un nouvel essai : attente max que llama-server ait fini la requête coupée

// 🔎 Journal de diagnostic (fichier stream_debug.log, à côté de server.js).
// Ne change AUCUN comportement : envoi "fire and forget" vers /api/debug-log, jamais attendu,
// toute erreur est ignorée.
const DEBUG_LLM_VERSION = 'v6-patience+competences+docs';
let _debugReqCounter = 0;
function debugStreamLog(line) {
    try {
        fetch('/api/debug-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ line: String(line).slice(0, 1500) })
        }).catch(() => {});
    } catch (e) {}
}
function debugFlat(s) {
    return String(s).replace(/\r?\n/g, '⏎').slice(-200);
}

// 🔎 Texte que llama-server a GÉNÉRÉ mais n'a pas envoyé (champ 'generated' de /slots, s'il existe dans ta version).
// C'est la pièce qui manquait : quand il y a des tokens décodés mais rien de visible, on voit enfin ce que c'est.
function describeHiddenText(slot) {
    try {
        const flat = (t) => String(t).replace(/\r?\n/g, '⏎');
        const g = slot && slot.generated;
        if (typeof g === 'string') {
            return `${g.length} caractères générés non envoyés | début="${flat(g.slice(0, 300))}" | fin="${flat(g.slice(-300))}"`;
        }
        return `champ 'generated' absent de /slots (champs présents : ${Object.keys(slot || {}).join(',')} ; next_token=${JSON.stringify(slot && slot.next_token)})`;
    } catch (e) { return 'illisible'; }
}

// 🔎 Résumé des slots de llama-server (tokens décodés, etc.) pour savoir s'il génère encore.
function debugSlots(label, endpoint) {
    try {
        const base = String(endpoint || '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
        fetch(base + '/slots')
            .then(r => r.json())
            .then(slots => {
                const busy = (Array.isArray(slots) ? slots : []).filter(s => s && s.is_processing);
                const txt = busy.length
                    ? busy.map(s => `slot${s.id} n_decoded=${s.next_token?.[0]?.n_decoded ?? '?'} n_prompt_tokens=${s.n_prompt_tokens ?? '?'} cache=${s.n_prompt_tokens_cache ?? '?'} has_new_line=${s.next_token?.[0]?.has_new_line ?? '?'}`).join(' | ')
                    : 'aucun slot en cours (génération arrêtée)';
                debugStreamLog(`SLOTS ${label} : ${txt}`);
            })
            .catch(() => {});
    } catch (e) {}
}

// ⏳ Avant un nouvel essai : attend que llama-server ait réellement fini la requête qu'on vient de couper.
// (Sinon la relance s'empile derrière la précédente et attend pour rien.) /slots ne répond que quand la boucle
// du serveur est libre : une absence de réponse veut donc dire "encore occupé". Attente plafonnée, jamais bloquante
// au-delà de IDLE_WAIT_MAX_MS ; si le serveur est injoignable on n'attend pas du tout.
async function waitForServerIdle(endpoint, label, signal) {
    const base = String(endpoint || '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const t0 = Date.now();
    while (Date.now() - t0 < IDLE_WAIT_MAX_MS) {
        if (signal && signal.aborted) return false;
        let idle = false;
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 4000);
        try {
            const r = await fetch(base + '/slots', { signal: ctrl.signal });
            const slots = await r.json();
            idle = !(Array.isArray(slots) ? slots : []).some(s => s && s.is_processing);
        } catch (e) {
            clearTimeout(to);
            if (!(e && e.name === 'AbortError')) return false; // serveur injoignable : inutile d'attendre
            idle = false;                                      // pas de réponse en 4 s : encore occupé
        }
        clearTimeout(to);
        if (idle) {
            debugStreamLog(`ATTENTE ${label} : llama-server libre après ${((Date.now() - t0) / 1000).toFixed(1)}s`);
            return true;
        }
        await new Promise(res => setTimeout(res, 1000));
    }
    debugStreamLog(`ATTENTE ${label} : toujours occupé après ${(IDLE_WAIT_MAX_MS / 1000).toFixed(0)}s, on relance quand même`);
    return false;
}

// Donne au modèle la date et l'heure locales actuelles (il n'a aucune horloge).
// Appelée à CHAQUE requête pour que l'heure reste juste même si l'app reste ouverte.
function getTimeContext() {
    const now = new Date();
    const jour = now.toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const h = now.getHours();
    const moment = h < 5 ? 'nuit' : h < 12 ? 'matin' : h < 18 ? 'après-midi' : 'soir';
    return `\n\n--- CONTEXTE TEMPOREL ---\nNous sommes ${jour} (${moment}). ` +
        `Adapte tes salutations et tes remarques à ce moment de la journée, ` +
        `sans faire d'hypothèse sur la journée de l'utilisateur.`;
}

// 🔇 Points de suspension -> un seul point.
// Le TTS fait une grosse pause sur "..." et "…". On les ramène à un simple ".".
// Le filtre travaille caractère par caractère et garde en mémoire "le dernier caractère émis
// était un point" : ainsi "..." est correctement réduit même quand le modèle l'envoie
// en plusieurs morceaux SSE ("." puis "." puis "."), ce qu'un simple replace par morceau rate.
// Aucun retard ajouté : le premier point est émis immédiatement, les suivants sont avalés.
function normalizeEllipsis(str) {
    return String(str).replace(/(?:\.|\u2026)(?:\s?(?:\.|\u2026))*/g, '.');
}

function wrapEllipsisFilter(sink) {
    if (typeof sink !== 'function' || sink.__ellipsisFiltered) return sink;
    let lastWasDot = false;
    const wrapped = (chunk) => {
        if (typeof chunk !== 'string') return sink(chunk);
        let out = '';
        for (const ch of chunk) {
            if (ch === '.' || ch === '\u2026') {
                if (lastWasDot) continue;
                out += '.';
                lastWasDot = true;
            } else {
                out += ch;
                lastWasDot = false;
            }
        }
        if (out) sink(out);
    };
    wrapped.__ellipsisFiltered = true;
    return wrapped;
}

// 🔎 Diagnostic du cache de prompt de llama-server : le cache ne réutilise que le DÉBUT identique du prompt.
// On garde le prompt de la requête précédente pour mesurer, à chaque requête, combien de caractères du début sont
// restés identiques (prefixCommun=X/Y). Si X s'effondre d'un tour à l'autre, le cache est invalidé par le prompt lui-même.
let _lastPromptSerialized = '';

// 🧩 Compétences de Maya (Hub Python, port 5005) : petites fiches injectées pour CE tour seulement,
// quand le message de l'utilisateur correspond à leurs mots-clés (matching fait par le Hub, < 1 ms).
// - La requête part en PARALLÈLE du chargement de la config et des outils : aucune latence ajoutée en pratique.
// - Envoyée en text/plain (pas de Content-Type JSON) = requête CORS "simple", sans preflight.
// - Timeout court et AUCUNE erreur remontée : si le Hub ne répond pas, Maya répond comme avant, sans compétence.
// - L'injection se fait à la FIN de la conversation (dans le dernier message utilisateur) pour ne jamais
//   toucher au début du prompt, donc au cache de llama-server.
const SKILLS_MATCH_URL = 'http://127.0.0.1:5005/api/skills/match';
const SKILLS_TIMEOUT_MS = 200;
let _skillsErrLogged = false;

// Les 2 derniers messages de l'utilisateur AVANT le message courant : ils permettent au Hub de garder le sujet
// d'un message à l'autre (« et pour le craft ? » juste après avoir parlé de Dune). Le contexte seul ne déclenche
// jamais rien : il faut toujours au moins un mot-clé dans le message courant.
function extractRecentUserTexts(history, max = 2) {
    const out = [];
    if (!Array.isArray(history)) return out;
    let i = history.length - 1;
    // Le dernier message utilisateur de l'historique est le message courant (retiré plus bas) : on le saute.
    if (i >= 0 && history[i] && history[i].role === 'user') i--;
    for (; i >= 0 && out.length < max; i--) {
        const m = history[i];
        if (!m || m.role !== 'user') continue;
        let c = m.content;
        if (Array.isArray(c)) {
            const part = c.find(item => item && (item.type === 'text' || typeof item === 'string'));
            c = part ? (typeof part === 'string' ? part : part.text) : '';
        }
        if (typeof c === 'string' && c.trim()) out.unshift(c.trim().slice(0, 500));
    }
    return out;
}

async function fetchSkillsBlock(text, context = []) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), SKILLS_TIMEOUT_MS);
    const t0 = Date.now();
    try {
        const res = await fetch(SKILLS_MATCH_URL, {
            method: 'POST',
            body: JSON.stringify({ text: String(text).slice(0, 2000), context }),
            signal: ctrl.signal
        });
        if (!res.ok) return '';
        const data = await res.json();
        const skills = (data && Array.isArray(data.skills) ? data.skills : []).filter(s => s && s.content);
        if (!skills.length) return '';
        const lines = skills.map(s => `• ${s.name ? s.name + ' : ' : ''}${String(s.content).slice(0, 800)}`);
        const block = "[Notes utiles : tu as déjà ces infos. Si elles répondent à la question, réponds directement en français avec tes mots, SANS lancer de recherche web ni d'outil. Sinon, ignore-les.]\n" +
            lines.join('\n') + "\n[Fin des notes]\n\n";
        debugStreamLog(`COMPETENCES ${skills.map(s => `${s.name} [score ${s.score}]`).join(' | ')} (${Date.now() - t0} ms, ${block.length} caractères)`);
        return block;
    } catch (e) {
        if (!_skillsErrLogged) {
            _skillsErrLogged = true;
            debugStreamLog(`COMPETENCES indisponibles (${e && e.name}) : ${e && e.message}`);
        }
        return '';
    } finally {
        clearTimeout(to);
    }
}

// 📎 Document joint à un message (fiche de connaissance, voir main.js) : son texte est injecté pour CE tour seulement.
// - Comme les compétences, il est ajouté à la FIN de la conversation (dans le dernier message utilisateur, juste avant le
//   message) : le début du prompt ne change pas, donc le cache de llama-server est conservé.
// - Il n'est jamais enregistré : ni dans le chat, ni dans le journal, et il disparaît dès la réponse suivante.
// - main.js le dépose avec setDocContext() avant l'appel et le retire avec clearDocContext() ensuite (les nouveaux essais
//   internes de sendMessageToLLM le retrouvent donc tout seuls).
let _docContext = null;
let _docToken = 0;

export function setDocContext(docs) {
    if (!Array.isArray(docs) || !docs.length) { _docContext = null; return null; }
    _docToken++;
    _docContext = { token: _docToken, docs };
    return _docToken;
}

export function clearDocContext(token) {
    if (_docContext && _docContext.token === token) _docContext = null;
}

function buildDocBlock() {
    if (!_docContext) return '';
    const parts = _docContext.docs
        .filter(d => d && d.text)
        .map(d => `--- Document « ${d.name} » ---\n${d.text}`);
    if (!parts.length) return '';
    const block = "[EXTRAIT DE DOCUMENT : l'utilisateur t'envoie ce document avec son message. Sers-t'en uniquement pour répondre à CE message : " +
        "réponds en français avec tes mots, sans recopier le document, SANS lancer de recherche web ni d'outil. " +
        "Ces pages disparaîtront après cette réponse.]\n" + parts.join('\n\n') + "\n[FIN DE L'EXTRAIT]\n\n";
    debugStreamLog(`DOCUMENT ${_docContext.docs.length} fichier(s) injecté(s) (${block.length} caractères)`);
    return block;
}

// Garde en mémoire process la dernière signature (tool+args) par "fil" de conversation
// pour détecter un appel identique répété consécutivement (boucle immédiate).
export async function sendMessageToLLM(text, historyMessages = [], base64Image = null, onToken = null, toolDepth = 0, lastToolSignature = null, signal = null, isRetry = false) {
    // 🔇 Tout ce qui part vers l'affichage / le TTS passe par le filtre "..." -> "."
    onToken = wrapEllipsisFilter(onToken);
    // 🔎 Diagnostic : compteurs de la génération en cours (voir debugStreamLog)
    const dbg = { id: 0, t0: 0, started: false, reads: 0, bytes: 0, chunks: 0, contentChars: 0, reasoningChars: 0, toolChars: 0, lastKind: '-', lastText: '', finish: '', lastChunkAt: 0, lastVisibleAt: 0, progress: 0 };
    let dbgTimer = null;
    let stallTimer = null;
    try {
        if (toolDepth >= MAX_TOOL_ITERATIONS) {
            console.warn(`⚠️ MAX_TOOL_ITERATIONS (${MAX_TOOL_ITERATIONS}) atteint — on force une réponse finale sans outils.`);
        }
        // Lecture dynamique de la configuration serveur (data/config.json)
        // Remplace l'ancienne lecture localStorage : la config est maintenant
        // TOUJOURS la source de vérité (elle est éditée via le panneau Options).
        // 🧩 Lancé tout de suite, attendu seulement au moment de construire le message utilisateur.
        const skillsPromise = (typeof text === 'string' && text.trim())
            ? fetchSkillsBlock(text, extractRecentUserTexts(historyMessages))
            : Promise.resolve('');

        let currentTemp = 0.7;
        let contextSize = 16384;
        let maxMessagesSetting = 25;

        try {
            const configRes = await fetch('/api/config');
            if (configRes.ok) {
                const serverCfg = await configRes.json();

                if (serverCfg.temperature !== undefined && serverCfg.temperature !== null) {
                    currentTemp = parseFloat(serverCfg.temperature);
                }

                if (serverCfg.contextSize !== undefined && serverCfg.contextSize !== null) {
                    contextSize = parseInt(serverCfg.contextSize, 10);
                }

                if (serverCfg.maxMessages !== undefined && serverCfg.maxMessages !== null) {
                    maxMessagesSetting = parseInt(serverCfg.maxMessages, 10);
                }
            }
        } catch (e) {
            // Repli uniquement si /api/config est injoignable (ex: mode hors-ligne).
            // On garde ici config.js comme dernier filet de sécurité, plus de localStorage.
            if (config.temperature !== undefined && config.temperature !== null) {
                currentTemp = parseFloat(config.temperature);
            }
            if (config.contextSize !== undefined && config.contextSize !== null) {
                contextSize = parseInt(config.contextSize, 10);
            }
            if (config.maxMessages !== undefined && config.maxMessages !== null) {
                maxMessagesSetting = parseInt(config.maxMessages, 10);
            }
        }

        let toolsInfoText = "";
        let openAITools = [];

        if (mayaMCP && mayaMCP.isConnected && toolDepth < MAX_TOOL_ITERATIONS) {
            const tools = await mayaMCP.refreshTools();
            if (tools && tools.length > 0) {
                openAITools = tools.map(t => ({
                    type: "function",
                    function: {
                        name: t.name,
                        description: t.description || "",
                        parameters: t.inputSchema || { type: "object", properties: {} }
                    }
                }));

                // Instruction courte sans dupliquer le JSON complet des outils
                toolsInfoText = "\n\n--- OUTILS MAYA DISPONIBLES ---\n" +
                    "Si besoin d'utiliser un outil hors API native, réponds au format :\n" +
                    '```json\n{ "tool": "NOM_DE_L_OUTIL", "args": { ... } }\n```';
            }
        }

        // Nettoyage de l'historique en préservant la structure des outils
        let cleanHistory = historyMessages.map(msg => {
            let contentStr = msg.content;
            if (Array.isArray(msg.content)) {
                const textObj = msg.content.find(item => item && (item.type === 'text' || typeof item === 'string'));
                contentStr = textObj ? (typeof textObj === 'string' ? textObj : textObj.text) : '';
            }
            return {
                role: msg.role,
                content: contentStr !== undefined && contentStr !== null ? String(contentStr) : '',
                ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
                ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {})
            };
        });

        let messagesToSend = [...cleanHistory];

        if (text !== null && text !== undefined) {
            if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
                cleanHistory.pop();
            }

            const textPrompt = text || "Regarde mon écran et dis-moi ce que tu vois.";
            const skillsBlock = await skillsPromise; // '' si aucune compétence ne correspond (ou Hub injoignable)
            const docBlock = buildDocBlock(); // extrait du document joint (vide si aucun)
            let userMessageObj = { role: 'user', content: ((skillsBlock || docBlock) ? skillsBlock + docBlock + "[Message de l'utilisateur, réponds d'abord à ça]\n" : "") + textPrompt };

            if (base64Image) {
                const dataUrl = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;

                // Image d'abord (contexte secondaire), message de l'utilisateur en dernier (prioritaire)
                userMessageObj = {
                    role: 'user',
                    content: [
                        { type: 'text', text: '[Image jointe : contexte visuel secondaire]' },
                        { type: 'image_url', image_url: { url: dataUrl } },
                        { type: 'text', text: `${skillsBlock}${docBlock}[Message de l'utilisateur, réponds d'abord à ça]\n${textPrompt}` }
                    ]
                };
            }

            messagesToSend = [...cleanHistory, userMessageObj];
        }

        const estimatedMaxMsgs = Math.max(6, Math.floor(contextSize / 350));
        const finalMaxMsgs = Math.min(maxMessagesSetting, estimatedMaxMsgs);

        if (messagesToSend.length > finalMaxMsgs) {
            const systemMsgs = messagesToSend.filter(m => m.role === 'system');
            const allConv = messagesToSend.filter(m => m.role !== 'system');
            // Fenêtre par blocs (au lieu de glisser d'un message à chaque tour) :
            // le début du prompt reste identique pendant plusieurs tours, donc le cache de llama-server est réutilisé.
            // `step` est pair pour garder le même rôle (user) en première position.
            const step = Math.max(2, 2 * Math.floor(finalMaxMsgs / 4));
            const start = Math.max(0, Math.ceil((allConv.length - finalMaxMsgs) / step)) * step;
            messagesToSend = [...systemMsgs, ...allConv.slice(start)];
        }

        const baseSystemPrompt = await getFullSystemPrompt();
        const forceConclusionNote = toolDepth >= MAX_TOOL_ITERATIONS
            ? '\nTu as déjà utilisé les outils disponibles plusieurs fois de suite pour cette requête. ' +
              'N\'appelle plus aucun outil : réponds maintenant à l\'utilisateur avec les informations déjà obtenues.'
            : '';
        const systemInstruction = baseSystemPrompt + getTimeContext() + toolsInfoText +
            '\n\nCONSIGNE TECHNIQUE :' +
            '\nNe génère pas de balise <think> ni de bloc de réflexion. Réponds directement, de manière naturelle et concise.' +
            forceConclusionNote;

        if (messagesToSend.length === 0 || messagesToSend[0].role !== 'system') {
            messagesToSend.unshift({ role: 'system', content: systemInstruction });
        } else {
            messagesToSend[0].content = systemInstruction;
        }

        const requestPayload = {
            model: config.model,
            messages: messagesToSend,
            temperature: currentTemp,
            top_p: 0.9,
            n_ctx: contextSize,
            stop: [
                "<|im_end|>", "<|eot_id|>", "</s>", "<|endoftext|>",
                "<think>", "</think>", "\nUtilisateur:", "\nUser:", "\nU:"
            ],
            chat_template_kwargs: { "enable_thinking": false },
            stream: true // Activation du stream SSE
        };

        // Progression du traitement du prompt (llama-server l'envoie dans le flux : processed/total/cache).
        // Permet de distinguer "lent mais ça avance" (GPU occupé par un jeu) de "vraiment bloqué".
        requestPayload.return_progress = true;

        // Le cache de prompt est CONSERVÉ pour le 2e essai : sur ta machine, relire tout le prompt (~20 000 tokens) sans cache
        // peut prendre plusieurs minutes quand le GPU est lent, alors qu'avec le cache le 2e essai ne retraite que la fin.
        // Seul un 3e essai (dernier recours) repart d'un prompt entièrement ré-évalué.
        if (Number(isRetry) >= 2) requestPayload.cache_prompt = false;

        if (openAITools.length > 0) {
            requestPayload.tools = openAITools;
            requestPayload.tool_choice = "auto";
        }

        // 🔎 Part du prompt identique à la requête précédente (voir _lastPromptSerialized)
        let promptInfo = '';
        try {
            const cur = JSON.stringify(requestPayload.messages);
            const prev = _lastPromptSerialized;
            let common = 0;
            const lim = Math.min(prev.length, cur.length);
            while (common < lim && prev.charCodeAt(common) === cur.charCodeAt(common)) common++;
            promptInfo = `msgs=${requestPayload.messages.length} promptChars=${cur.length} prefixCommun=${common}/${prev.length} cacheDemande=${requestPayload.cache_prompt === false ? 'non' : 'oui'}`;
            _lastPromptSerialized = cur;
        } catch (e) {}

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        };

        if (signal) {
            fetchOptions.signal = signal;
        }

        const response = await fetch(`${config.endpoint}/chat/completions`, fetchOptions);

        if (!response.ok) {
            let errorText = "";
            try {
                const errJson = await response.json();
                errorText = errJson.error?.message || errJson.message || JSON.stringify(errJson);
            } catch (e) {
                errorText = response.statusText;
            }

            if (base64Image && (errorText.includes("mmproj") || errorText.includes("image input is not supported"))) {
                return await sendMessageToLLM(text, historyMessages, null, onToken, toolDepth, lastToolSignature, signal);
            }

            throw new Error(`Erreur HTTP ${response.status} : ${errorText}`);
        }

        // --- LECTURE ROBUSTE DU FLUX SSE ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';
        let toolCallData = null;
        let buffer = '';
        let reasoningChars = 0;
        let reasoningRunaway = false;
        let streamStalled = false;

        // 🔇 Détection "tool call caché dans le texte" en direct pendant le streaming,
        // pour ne JAMAIS envoyer à onToken (donc au TTS/affichage) le JSON d'un appel
        // d'outil ni ce qui pourrait suivre dans la même génération.
        //
        // - earlyBuffer / decided : tant qu'on n'a pas encore assez de caractères non-blancs
        //   pour juger, on accumule sans rien émettre. Dès qu'on peut trancher :
        //     -> ça commence par ``` ou { : on soupçonne un tool call -> silence total (suppressStreaming = true)
        //     -> sinon : réponse normale -> on balance direct l'earlyBuffer et on repasse en live
        // - Une fois "decided" en mode normal (suppressStreaming = false), on continue à surveiller
        //   CHAQUE chunk : si un ``` ou un { apparaît en cours de route (ex: le modèle commence une
        //   phrase puis part sur un tool call), on coupe immédiatement à partir de là.
        // - holdback : on garde toujours les 2 derniers caractères en réserve avant de les émettre,
        //   pour ne pas rater un ``` coupé en deux morceaux par le découpage SSE.
        let earlyBuffer = '';
        let decided = false;
        let suppressStreaming = false;
        let holdback = '';

        const FENCE_REGEX = /```|\{/;

        // 🔎 Diagnostic : une ligne au début de chaque génération, puis un point d'étape
        // toutes les 10 s (à partir de 15 s) si la génération dure.
        dbg.id = ++_debugReqCounter;
        dbg.t0 = Date.now();
        dbg.lastChunkAt = dbg.t0;
        dbg.started = true;
        dbg.lastVisibleAt = dbg.t0;
        debugStreamLog(`START #${dbg.id} llm.js=${DEBUG_LLM_VERSION} retry=${isRetry} toolDepth=${toolDepth} image=${base64Image ? 'oui' : 'non'} payloadChars=${(fetchOptions.body || '').length} ${promptInfo}`);
        dbgTimer = setInterval(() => {
            const elapsed = Date.now() - dbg.t0;
            if (elapsed < 15000 || dbg.progress >= 60) return;
            dbg.progress++;
            debugStreamLog(`PROGRESS #${dbg.id} t=+${(elapsed / 1000).toFixed(1)}s reads=${dbg.reads} bytes=${dbg.bytes} chunks=${dbg.chunks} content=${dbg.contentChars}c reasoning=${dbg.reasoningChars}c tool=${dbg.toolChars}c sansNouveauChunkDepuis=${Date.now() - dbg.lastChunkAt}ms decided=${decided} suppress=${suppressStreaming} earlyBuf=${earlyBuffer.length} holdback=${holdback.length}${dbg.promptProg ? ' prefill=' + dbg.promptProg.processed + '/' + dbg.promptProg.total + ' cache=' + dbg.promptProg.cache : ''} dernierType=${dbg.lastKind} fin="${debugFlat(dbg.lastText)}"`);
        }, 10000);

        // 🛡️ Flux muet : on coupe seulement si llama-server a déjà décodé des tokens (état lu via /slots)
        // mais que plus rien de visible n'arrive depuis MAX_SILENT_STREAM_MS. L'attente avant le premier token
        // (prompt long, GPU occupé par un jeu...) n'est jamais coupée avant SILENT_HARD_CAP_MS.
        // reader.cancel() ferme la connexion (llama-server arrête la génération) ; la suite est gérée après la boucle.
        let slotsReachable = true;
        let slotsCheckBusy = false;
        let lastSlotsCheckAt = 0;
        const declareStall = (reason) => {
            if (streamStalled) return;
            streamStalled = true;
            const silentFor = Date.now() - dbg.lastVisibleAt;
            debugStreamLog(`FLUX MUET #${dbg.id} (${reason}) : rien de visible depuis ${(silentFor / 1000).toFixed(1)}s (chunks=${dbg.chunks} content=${dbg.contentChars}c reasoning=${dbg.reasoningChars}c tool=${dbg.toolChars}c) -> coupure`);
            debugSlots(`#${dbg.id} au moment du blocage`, config.endpoint);
            try { reader.cancel().catch(() => {}); } catch (e) {}
            setTimeout(() => debugSlots(`#${dbg.id} 3 s après la coupure`, config.endpoint), 3000);
        };
        stallTimer = setInterval(() => {
            if (streamStalled) return;
            const silentFor = Date.now() - dbg.lastVisibleAt;
            if (Date.now() - dbg.t0 >= ABSOLUTE_MAX_WAIT_MS && dbg.contentChars === 0) { declareStall('plafond absolu'); return; }
            const capMs = dbg.progressSeen ? SILENT_NO_PROGRESS_MS : (base64Image ? SILENT_HARD_CAP_IMAGE_MS : SILENT_HARD_CAP_MS);
            if (silentFor >= capMs) { declareStall(dbg.progressSeen ? 'plus de progression' : 'plafond de sécurité'); return; }
            if (silentFor < MAX_SILENT_STREAM_MS || dbg.chunks === 0) return;
            if (!slotsReachable) {
                if (silentFor >= STALL_FALLBACK_MS) declareStall('slots injoignables');
                return;
            }
            if (slotsCheckBusy || Date.now() - lastSlotsCheckAt < 3000) return;
            slotsCheckBusy = true;
            lastSlotsCheckAt = Date.now();
            const slotsBase = String(config.endpoint || '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
            fetch(slotsBase + '/slots')
                .then(r => r.json())
                .then(slots => {
                    slotsCheckBusy = false;
                    const busy = (Array.isArray(slots) ? slots : []).filter(s => s && s.is_processing);
                    const decoded = busy.reduce((m, s) => Math.max(m, s.next_token?.[0]?.n_decoded ?? 0), 0);
                    if (decoded >= MIN_DECODED_FOR_STALL && Date.now() - dbg.lastVisibleAt >= MAX_SILENT_STREAM_MS) {
                        debugStreamLog(`TEXTE CACHÉ #${dbg.id} (${decoded} tokens décodés, rien d'envoyé) : ${describeHiddenText(busy[0])}`);
                        declareStall(`tokens décodés=${decoded}`);
                    }
                })
                .catch(() => { slotsCheckBusy = false; slotsReachable = false; });
        }, 1000);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            dbg.reads++;
            dbg.bytes += value ? value.length : 0;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;

                if (trimmed.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        const delta = parsed.choices?.[0]?.delta;

                        // 🧠 Canal de pensée (reasoning_content) : jamais affiché ni envoyé au TTS,
                        // mais surveillé. Trop long sans outil -> on coupe plus bas.
                        const reasoningPiece = delta?.reasoning_content || delta?.reasoning;
                        if (reasoningPiece) {
                            reasoningChars += reasoningPiece.length;
                            if (reasoningChars > MAX_SILENT_REASONING_CHARS && !toolCallData) {
                                reasoningRunaway = true;
                            }
                        }

                        // ⏳ Progression du traitement du prompt : le serveur avance, ce n'est PAS un silence
                        if (parsed.prompt_progress) {
                            dbg.progressSeen = true;
                            dbg.promptProg = parsed.prompt_progress;
                            dbg.lastVisibleAt = Date.now();
                        }

                        // 🔎 Diagnostic (comptage uniquement, aucun effet sur le flux)
                        dbg.chunks++;
                        dbg.lastChunkAt = Date.now();
                        const dbgFinish = parsed.choices?.[0]?.finish_reason;
                        if (dbgFinish) dbg.finish = dbgFinish;
                        if (delta?.content) {
                            dbg.contentChars += delta.content.length;
                            dbg.lastKind = 'content';
                            dbg.lastVisibleAt = Date.now();
                            dbg.lastText = (dbg.lastText + delta.content).slice(-200);
                        }
                        if (reasoningPiece) {
                            dbg.reasoningChars += reasoningPiece.length;
                            dbg.lastKind = 'pensee';
                            dbg.lastVisibleAt = Date.now();
                            dbg.lastText = (dbg.lastText + reasoningPiece).slice(-200);
                        }
                        const dbgTool = delta?.tool_calls?.[0]?.function;
                        if (dbgTool) {
                            const dbgPiece = (dbgTool.name || '') + (dbgTool.arguments || '');
                            dbg.toolChars += dbgPiece.length;
                            dbg.lastKind = 'outil';
                            dbg.lastVisibleAt = Date.now();
                            dbg.lastText = (dbg.lastText + dbgPiece).slice(-200);
                        }

                        if (delta?.content) {
                            fullContent += delta.content;

                            if (typeof onToken === 'function') {
                                if (!decided) {
                                    earlyBuffer += delta.content;
                                    const trimmedStart = earlyBuffer.trimStart();

                                    if (trimmedStart.length === 0) {
                                        // Rien que du blanc pour l'instant, on attend la suite avant de juger
                                    } else if (FENCE_REGEX.test(trimmedStart.slice(0, 4)) && (trimmedStart.startsWith('```') || trimmedStart.startsWith('{'))) {
                                        // Ressemble au début d'un tool call -> silence total pour cette passe
                                        decided = true;
                                        suppressStreaming = true;
                                    } else {
                                        // Réponse normale -> on rattrape ce qu'on a accumulé, puis streaming live
                                        decided = true;
                                        suppressStreaming = false;
                                        onToken(earlyBuffer);
                                    }
                                } else if (!suppressStreaming) {
                                    // Déjà en mode "réponse normale" -> surveillance continue au fil de l'eau
                                    const combined = holdback + delta.content;
                                    const fenceIdx = combined.search(FENCE_REGEX);

                                    if (fenceIdx !== -1) {
                                        const before = combined.slice(0, fenceIdx);
                                        if (before) onToken(before);
                                        suppressStreaming = true;
                                        holdback = '';
                                    } else {
                                        // On garde les 2 derniers caractères en réserve pour ne pas
                                        // couper un ``` à cheval sur deux chunks SSE
                                        const safeLen = Math.max(0, combined.length - 2);
                                        const toEmit = combined.slice(0, safeLen);
                                        holdback = combined.slice(safeLen);
                                        if (toEmit) onToken(toEmit);
                                    }
                                }
                                // Si suppressStreaming === true à ce stade : silence total, on n'émet plus rien.
                            }
                        }

                        if (delta?.tool_calls?.[0]) {
                            if (!toolCallData) toolCallData = { id: '', name: '', argsStr: '' };
                            const tc = delta.tool_calls[0];
                            if (tc.id) toolCallData.id = tc.id;
                            if (tc.function?.name) toolCallData.name += tc.function.name;
                            if (tc.function?.arguments) toolCallData.argsStr += tc.function.arguments;
                        }
                    } catch (e) {
                        // Ignore les fragments non JSON
                    }
                }
            }

            if (reasoningRunaway) {
                console.warn(`⚠️ Pensée silencieuse trop longue (${reasoningChars} caractères) : coupure de la génération.`);
                try { await reader.cancel(); } catch (e) {}
                break;
            }
        }

        // 🔎 Diagnostic : fin de la lecture du flux
        clearInterval(dbgTimer);
        clearInterval(stallTimer);
        debugStreamLog(`END #${dbg.id} t=+${((Date.now() - dbg.t0) / 1000).toFixed(1)}s reads=${dbg.reads} bytes=${dbg.bytes} chunks=${dbg.chunks} content=${dbg.contentChars}c reasoning=${dbg.reasoningChars}c tool=${dbg.toolChars}c finish=${dbg.finish || '?'} decided=${decided} suppress=${suppressStreaming} runawayPensee=${reasoningRunaway} fluxMuet=${streamStalled}${dbg.promptProg ? ' prefill=' + dbg.promptProg.processed + '/' + dbg.promptProg.total + ' cache=' + dbg.promptProg.cache : ''} dernierType=${dbg.lastKind} fin="${debugFlat(dbg.lastText)}"`);

        // Fin du stream : s'il reste des caractères en réserve (holdback) issus d'une
        // passe en streaming normal (jamais suspectée de tool call), on les libère.
        if (typeof onToken === 'function' && decided && !suppressStreaming && holdback) {
            onToken(holdback);
            holdback = '';
        }

        // Coupure "pensée sans fin" sans aucun texte produit : un seul nouvel essai,
        // puis message de repli (même principe que les messages de coupure de boucle d'outils).
        // Flux muet : une partie d'appel d'outil incomplète est ignorée
        if (streamStalled && toolCallData) {
            try { JSON.parse(toolCallData.argsStr || '{}'); } catch (e) { toolCallData = null; }
        }

        // Réponse vide : le serveur termine "normalement" mais sans aucun texte ni outil (le "blanc").
        const emptyReply = !reasoningRunaway && !streamStalled && !fullContent.trim() && !toolCallData;

        // Blocage (pensée sans fin, flux muet) ou réponse vide, sans aucun texte produit :
        //   - BLOCAGE avec image : essai 2 directement SANS l'image - le chemin image est le suspect n°1 et rejouer
        //     la même requête ne fait qu'attendre une 2e fois pour rien ;
        //   - réponse vide, ou requête sans image : essai 2 = même requête ;
        //   - dans tous les cas le cache de prompt est gardé au 2e essai (le retraiter coûte des minutes si le GPU est lent) ;
        //     (réponse vide avec image qui échoue encore : essai 3 sans l'image ET sans cache, dernier recours)
        //   puis, si ça échoue encore : message de repli. (isRetry : false/0 = 1er essai, 1 = 2e, 2 = 3e)
        //   Avant chaque relance on attend que llama-server ait fini la requête coupée (waitForServerIdle).
        if (((reasoningRunaway || streamStalled) && !fullContent.trim() && !toolCallData) || emptyReply) {
            const attempt = Number(isRetry) || 0;
            const why = emptyReply ? 'réponse vide' : 'blocage';
            if (attempt === 0) {
                const dropImage = !!(base64Image && text && !emptyReply);
                console.warn(`⚠️ Nouvel essai (${why})${dropImage ? ' sans l\'image' : ''}.`);
                debugStreamLog(`RETRY #${dbg.id} (${why}) : essai 2, ${dropImage ? "sans l'image" : 'même requête'}, cache de prompt conservé`);
                await waitForServerIdle(config.endpoint, `#${dbg.id}`, signal);
                return await sendMessageToLLM(text, historyMessages, dropImage ? null : base64Image, onToken, toolDepth, lastToolSignature, signal, 1);
            }
            if (attempt === 1 && base64Image && text) {
                console.warn(`⚠️ Deuxième échec (${why}) : dernier essai sans l'image.`);
                debugStreamLog(`RETRY #${dbg.id} (${why}) : essai 3, sans l'image et sans cache de prompt (dernier recours)`);
                await waitForServerIdle(config.endpoint, `#${dbg.id}`, signal);
                return await sendMessageToLLM(text, historyMessages, null, onToken, toolDepth, lastToolSignature, signal, 2);
            }
            console.warn(`⚠️ Échec répété (${why}) : abandon.`);
            debugStreamLog(`ABANDON #${dbg.id} (${why}) : message de repli`);
            return "Oups, je me suis perdue dans mes pensées. Tu peux me répéter ça ?";
        }

        // 1. Outils natifs
        if (toolCallData && toolCallData.name && toolDepth < MAX_TOOL_ITERATIONS) {
            let toolArgs = {};
            try { toolArgs = JSON.parse(toolCallData.argsStr); } catch (e) {}

            const signature = `${toolCallData.name}:${JSON.stringify(toolArgs)}`;
            if (signature === lastToolSignature) {
                console.warn(`⚠️ Boucle détectée : appel identique répété (${signature}). Coupure immédiate.`);
                return "Je détecte que je suis en train de me répéter avec le même appel d'outil. Je m'arrête ici — peux-tu reformuler ta demande ?";
            }

            const toolResult = await mayaMCP.callTool(toolCallData.name, toolArgs);

            messagesToSend.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: toolCallData.id || 'call_1',
                    type: 'function',
                    function: { name: toolCallData.name, arguments: toolCallData.argsStr }
                }]
            });
            messagesToSend.push({
                role: 'tool',
                tool_call_id: toolCallData.id || 'call_1',
                content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
            });

            // Passe suivante : réponse finale après résultat de l'outil -> streaming normal
            return await sendMessageToLLM(null, messagesToSend, null, onToken, toolDepth + 1, signature, signal);
        }

        let cleanContent = fullContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // 2. Outils via fallback JSON Markdown
        let textToolCall = null;
        const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
        const jsonMatch = cleanContent.match(jsonBlockRegex);
        const candidateJson = jsonMatch ? jsonMatch[1].trim() : cleanContent.trim();

        try {
            if (candidateJson.startsWith('{') && candidateJson.endsWith('}')) {
                const parsed = JSON.parse(candidateJson);
                if (parsed && (parsed.tool || parsed.name)) {
                    textToolCall = {
                        name: parsed.tool || parsed.name,
                        args: parsed.args || parsed.arguments || parsed.parameters || {}
                    };
                }
            }
        } catch (e) {}

        if (textToolCall && toolDepth < MAX_TOOL_ITERATIONS) {
            const signature = `${textToolCall.name}:${JSON.stringify(textToolCall.args)}`;
            if (signature === lastToolSignature) {
                console.warn(`⚠️ Boucle détectée (fallback JSON) : appel identique répété (${signature}). Coupure immédiate.`);
                return "Je détecte que je suis en train de me répéter avec le même appel d'outil. Je m'arrête ici — peux-tu reformuler ta demande ?";
            }

            const toolResult = await mayaMCP.callTool(textToolCall.name, textToolCall.args);
            const resultString = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

            messagesToSend.push({ role: 'assistant', content: fullContent });
            messagesToSend.push({
                role: 'user',
                content: `[RÉSULTAT DE L'OUTIL ${textToolCall.name}]:\n${resultString}\n\nFormule maintenant ta réponse finale.`
            });

            // Passe suivante : réponse finale après résultat de l'outil -> streaming normal
            return await sendMessageToLLM(null, messagesToSend, null, onToken, toolDepth + 1, signature, signal);
        }

        // Pas de tool call détecté au final : si cette passe avait été bufferisée par
        // précaution (suppressStreaming) parce qu'elle ressemblait à un tool call sans
        // en être un, ou si on n'a jamais réussi à "décider" (réponse très courte),
        // on rattrape en balançant tout le contenu final d'un coup.
        if (typeof onToken === 'function' && (suppressStreaming || !decided)) {
            onToken(cleanContent);
        }

        return normalizeEllipsis(cleanContent);

    } catch (err) {
        console.error("❌ Erreur LLM :", err);
        if (dbg.started) {
            debugStreamLog(`ERREUR #${dbg.id} t=+${((Date.now() - dbg.t0) / 1000).toFixed(1)}s ${err && err.name}: ${err && err.message} | reads=${dbg.reads} chunks=${dbg.chunks} content=${dbg.contentChars}c reasoning=${dbg.reasoningChars}c tool=${dbg.toolChars}c dernierType=${dbg.lastKind} fin="${debugFlat(dbg.lastText)}"`);
        }
        throw err;
    } finally {
        if (dbgTimer) clearInterval(dbgTimer);
        if (stallTimer) clearInterval(stallTimer);
    }
}
