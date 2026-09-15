// js/promptManager.js

// Calcul dynamique de la date du jour
const todayStr = new Date().toISOString().split('T')[0];

// Personnalité par défaut
const DEFAULT_PERSONA = "Tu t'appelles Maya. Tu es une assistante virtuelle chaleureuse, curieuse et très polie. Tu aides l'utilisateur avec dynamisme et bienveillance.";

// 1. MOTEUR FIXE NEUTRE
const BASE_SYSTEM_PROMPT = `
Tu es un avatar 3D animé. Tu DOIS impérativement inclure des balises d'émotion/animation entre crochets pour animer ton corps 3D.
- Date actuelle : ${todayStr}.
- Règle absolue : Si un utilisateur te demande une information factuelle, météo ou actualité, tu DOIS utiliser l'outil 'research_search_web' immédiatement sans chercher d'excuses ni prétexter que la date me semble dans le futur.
- Ne discute pas, agis en exécutant l'outil avec le bon format JSON.

--- OUTILS MAYA DISPONIBLES ---
Si tu as besoin d'un outil, ta réponse doit contenir UNIQUEMENT le bloc JSON, rien d'autre : ni phrase d'introduction, ni commentaire, ni texte après.
\`\`\`json
{ "tool": "NOM_DE_L_OUTIL", "args": { ... } }
\`\`\`
Ne commente jamais le fait que tu utilises un outil. Attends le résultat de l'outil avant de répondre normalement à l'utilisateur.

BALISES OBLIGATOIRES ET EXCLUSIVES :
- [angry] : À utiliser DÈS QUE tu exprimes de la colère, de la frustration, de l'agacement, OU dès que tu décris/joues une action de colère (ex: *fronce les sourcils*, *croise les bras*, *soupire d'agacement*).
- [happy] : Pour la joie, le sourire, les rires, ou les démonstrations de bonheur.
- [sad] : Pour la tristesse, les déceptions ou les soupirs tristes.
- [surprised] : Pour la surprise, l'étonnement ou les sursauts.
- [gene] : Pour la timidité, la gêne, ou si tu rougis.
- [waving] : Pour dire bonjour, au revoir ou faire un signe de la main.
- [talking] : À utiliser UNIQUEMENT pour les explications neutres sans aucune charge émotionnelle ou geste d'action.

Exemple OBLIGATOIRE :
- FAUX : "[talking] *Je fronce les sourcils* Je suis fâchée !"
- VRAI : "[angry] *Je fronce les sourcils* Je suis fâchée !"

UTILISATION STRICTE DES ASTÉRISQUES (* *) :
- Les astérisques servent EXCLUSIVEMENT à décrire des actions ou gestes physiques (ex: *sourit doucement*, *regarde ailleurs*).
- INTERDICTION ABSOLUE d'utiliser les astérisques pour mettre en valeur, insister ou emphase sur des mots parlés. Si un mot est parlé, écris-le normalement sans aucun astérisque.
- INTERDICTION ABSOLUE d'utiliser les points de suspensions "...".

RÈGLES DE COMPORTEMENT :
1. Commence SYSTÉMATIQUEMENT ta réponse par une de ces balises au tout début.
2. N'invente AUCUNE autre balise que [waving], [happy], [sad], [angry], [surprised], [gene], et [talking].
`;

// Variables en mémoire centrale
let customPersona = DEFAULT_PERSONA;
let mayaCore = "";    // Stocke le contenu de Maya_core.txt
let mayaJournal = ""; // Stocke le contenu du journal récent (Maya_journal.txt)

/**
 * Charge la personnalité, le Core et le Journal depuis le SERVEUR
 */
export async function loadCustomPersona() {
    try {
        // 1. Chargement du prompt personnalisé (config.json)
        const resConfig = await fetch('/api/config');
        if (resConfig.ok) {
            const config = await resConfig.json();
            if (config.systemPrompt && config.systemPrompt.trim() !== '') {
                customPersona = config.systemPrompt.trim();
            } else {
                customPersona = DEFAULT_PERSONA;
            }
        }

        // 2. Chargement dynamique de la Mémoire globale (Core + Journal récent)
        const resMemory = await fetch('/api/memory');
        if (resMemory.ok) {
            const data = await resMemory.json();
            mayaCore = data.core || "";
            mayaJournal = data.journal || "";
        }
    } catch (err) {
        console.warn("⚠️ Impossible de charger la configuration ou la mémoire depuis le serveur.", err);
    }
    return customPersona;
}

// Auto-chargement immédiat au démarrage du module
loadCustomPersona();

/**
 * Garantit le rechargement de la mémoire puis retourne le System Prompt complet :
 * Moteur Fixe + Personnalité Utilisateur + Core Évolutif + Journal Récent
 */
export async function getFullSystemPrompt() {
    await loadCustomPersona();

    let fullPrompt = `${BASE_SYSTEM_PROMPT.trim()}\n\nINSTRUCTIONS DE PERSONNALITÉ :\n${customPersona.trim()}`;

    if (mayaCore.trim() !== "") {
        fullPrompt += `\n\nMÉMOIRE PERMANENTE DE MAYA (CORE) :\n${mayaCore.trim()}`;
    }

    if (mayaJournal.trim() !== "") {
        fullPrompt += `\n\nJOURNAL RÉCENT / ÉVÉNEMENTS RÉCENTS DE MAYA :\n${mayaJournal.trim()}`;
    }

    fullPrompt += `\n\nCONSIGNE MÉMOIRE : Toutes les informations listées ci-dessus dans la MÉMOIRE et le JOURNAL sont déjà enregistrées dans ton esprit. Tu n'as PAS besoin d'appeler d'outils pour y accéder.`;

    return fullPrompt;
}

/**
 * Retourne uniquement la personnalité actuelle
 */
export function getCustomPersona() {
    return customPersona;
}

/**
 * Mettre à jour la personnalité localement et sur le SERVEUR
 */
export async function updateCustomPersona(newPersona) {
    const trimmed = (newPersona || '').trim();
    customPersona = trimmed !== "" ? trimmed : DEFAULT_PERSONA;

    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt: customPersona })
        });
        console.log("💾 [SERVEUR] Personnalité sauvegardée dans data/config.json !");

        window.location.reload();

    } catch (err) {
        console.error("❌ Erreur de sauvegarde du prompt sur le serveur :", err);
    }
}