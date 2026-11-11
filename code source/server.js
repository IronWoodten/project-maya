const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const readline = require('readline');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// --- LOGGER D'API ---
app.use('/api', (req, res, next) => {
    // Le polling des événements de jeu et le relais du mode donjon (très fréquents) ne sont pas loggés : ils noieraient la console.
    if (!((req.method === 'GET' && req.originalUrl.startsWith('/api/game-event')) || req.originalUrl.startsWith('/api/dungeon-') || req.originalUrl.startsWith('/api/status'))) {
        console.log(`📡 [API REQUEST] ${req.method} ${req.originalUrl}`);
    }
    next();
});

// --- CONFIGURATION DU HUB MAYA (PYTHON STDIO) ---
const PYTHON_PATH = process.env.PYTHON_PATH || 'python';
const MCP_SCRIPT = path.join(__dirname, 'Maya_Hub', 'mcp_server', 'server.py');

console.log('🔄 Démarrage du Hub Maya local (Python MCP)...');

let mayaProcess = null;

function startMayaProcess() {
    try {
        mayaProcess = spawn(PYTHON_PATH, [MCP_SCRIPT], {
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            windowsHide: true
        });

        const pendingMcpRequests = new Map();
        const rl = readline.createInterface({ input: mayaProcess.stdout });

        rl.on('line', (line) => {
            try {
                const data = JSON.parse(line);
                if (data.id !== undefined && data.id !== null) {
                    const reqId = String(data.id);
                    if (pendingMcpRequests.has(reqId)) {
                        const item = pendingMcpRequests.get(reqId);
                        clearTimeout(item.timeout);
                        pendingMcpRequests.delete(reqId);
                        if (!item.res.headersSent) {
                            return item.res.json(data);
                        }
                    }
                }
            } catch (err) {
                console.warn(`⚠️ [Maya Hub stdout] Ligne non-JSON ignorée : ${line}`);
            }
        });

        mayaProcess.stderr.on('data', (data) => {
            console.log(`[Maya Hub Log]: ${data.toString().trim()}`);
        });

        mayaProcess.on('close', (code) => {
            console.warn(`⚠️ Processus Maya Hub arrêté avec le code : ${code}`);
            for (const [reqId, item] of pendingMcpRequests.entries()) {
                clearTimeout(item.timeout);
                if (!item.res.headersSent) {
                    item.res.status(503).json({ error: 'Processus Maya interrompu' });
                }
            }
            pendingMcpRequests.clear();
        });

        setTimeout(() => {
            if (!mayaProcess || mayaProcess.killed) return;
            try {
                const initReq = {
                    jsonrpc: "2.0",
                    id: "init_sys",
                    method: "initialize",
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: { name: "NodeBridge", version: "1.0.0" }
                    }
                };
                mayaProcess.stdin.write(JSON.stringify(initReq) + '\n');
                console.log("⚡ MCP FastMCP initialisé !");
            } catch (e) {
                console.error("Erreur d'initialisation MCP :", e);
            }
        }, 2000);

        return { mayaProcess, pendingMcpRequests };
    } catch (err) {
        console.error("❌ Échec du lancement de Maya Hub Python :", err);
        return { mayaProcess: null, pendingMcpRequests: new Map() };
    }
}

const { pendingMcpRequests } = startMayaProcess();

app.post('/api/mcp', (req, res) => {
    req.setTimeout(120000);

    const body = req.body;
    if (!body || body.id === undefined || body.id === null) {
        return res.status(400).json({ error: 'Requête JSON-RPC invalide' });
    }
    if (!mayaProcess || mayaProcess.exitCode !== null) {
        return res.status(503).json({ error: 'Maya Hub Python est arrêté' });
    }

    const reqId = String(body.id);

    const timeout = setTimeout(() => {
        if (pendingMcpRequests.has(reqId)) {
            pendingMcpRequests.delete(reqId);
            if (!res.headersSent) {
                res.status(504).json({ error: 'Timeout du Hub Maya (recherche trop longue)' });
            }
        }
    }, 120000);

    pendingMcpRequests.set(reqId, { res, timeout });

    try {
        mayaProcess.stdin.write(JSON.stringify(body) + '\n');
    } catch (err) {
        clearTimeout(timeout);
        pendingMcpRequests.delete(reqId);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur de communication Maya Hub' });
        }
    }
});

// --- QUEUE D'ÉVÉNEMENTS TIMER (timer_popup.py -> front) ---
// timer_popup.py POST ici directement quand un décompte se termine.
// Le front (main.js) vide cette queue par polling régulier et
// déclenche un tour de conversation avec le LLM à partir du fait brut.
let pendingTimerEvents = [];

app.post('/api/timer-finished', (req, res) => {
    const { label, message } = req.body || {};
    pendingTimerEvents.push({ label: label || 'Timer', message: message || null });
    res.json({ success: true });
});

app.get('/api/timer-finished', (req, res) => {
    const pending = pendingTimerEvents;
    pendingTimerEvents = [];
    res.json({ pending });
});

// --- QUEUE D'ÉVÉNEMENTS JEU (game_popup.py -> front) ---
// game_popup.py POST ici un message déjà rédigé (priority: 'critical' | 'high' | 'mid' | 'low').
// Le front (main.js) vide cette queue par polling rapide et fait réagir Maya.
let pendingGameEvents = [];

app.post('/api/game-event', (req, res) => {
    const { message, priority } = req.body || {};
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ success: false, error: 'message manquant' });
    }
    pendingGameEvents.push({ message, priority: priority || 'low', ts: Date.now(), nosave: !!(req.body && req.body.nosave) });
    if (pendingGameEvents.length > 20) pendingGameEvents = pendingGameEvents.slice(-20);
    res.json({ success: true });
});

app.get('/api/game-event', (req, res) => {
    const pending = pendingGameEvents;
    pendingGameEvents = [];
    res.json({ pending });
});

// --- MODE DONJON (campagne Station Nyx) ---
// station_popup.py envoie un heartbeat (active / intercept) ; tant qu'il est frais (< 7 s) et que 'intercept' est vrai,
// le front (main.js) relaie ce que le joueur dit/écrit à Maya vers le jeu au lieu de l'envoyer au LLM.
// Le jeu vient chercher ces textes par polling (GET /api/dungeon-input) et répond via /api/game-event.
let dungeonState = { active: false, intercept: true, ts: 0 };
let pendingDungeonInputs = [];

app.post('/api/dungeon-state', (req, res) => {
    const b = req.body || {};
    dungeonState = { active: !!b.active, intercept: b.intercept !== false, ts: Date.now() };
    if (!dungeonState.active) pendingDungeonInputs = [];
    res.json({ success: true });
});

app.get('/api/dungeon-state', (req, res) => {
    const fresh = (Date.now() - dungeonState.ts) < 7000;
    res.json({ active: fresh && dungeonState.active, intercept: dungeonState.intercept });
});

app.post('/api/dungeon-input', (req, res) => {
    const text = req.body && req.body.text;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: 'text manquant' });
    }
    pendingDungeonInputs.push(text);
    if (pendingDungeonInputs.length > 10) pendingDungeonInputs = pendingDungeonInputs.slice(-10);
    res.json({ success: true });
});

app.get('/api/dungeon-input', (req, res) => {
    const pending = pendingDungeonInputs;
    pendingDungeonInputs = [];
    res.json({ pending });
});

// --- DOSSIERS STATIQUES & CRÉATION ---
const MODELS_DIR = path.join(__dirname, 'models');
const BG_DIR = path.join(__dirname, 'backgrounds');
const CHATS_DIR = path.join(__dirname, 'data', 'chats');
const AUTONOMY_DIR = path.join(__dirname, 'Maya_Hub', 'autonomy');
const GOALS_FILE = path.join(AUTONOMY_DIR, 'goals.json');
const GGUF_DIR = path.join(__dirname, 'model GGUF');
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const TAVILY_CONFIG_FILE = path.join(__dirname, 'Maya_Hub', 'config.json');

// --- DOSSIERS ET FICHIERS DE MÉMOIRE MAYA ---
const MEMORY_DIR = path.join(__dirname, 'Maya_memory', 'Memory');
const CORE_FILE = path.join(MEMORY_DIR, 'Maya_core.txt');
const JOURNAL_FILE = path.join(MEMORY_DIR, 'journal_recent.txt');
const MENSUEL_FILE = path.join(MEMORY_DIR, 'journal_mensuel.txt');

// Verrou de fichier inter-processus (Node <-> Python) sans dépendance
// externe : un seul processus peut créer le .lock à la fois ('wx'),
// l'autre attend et réessaie jusqu'au timeout. Protège contre une
// collision entre l'ajout d'une entrée ici et archive_memory.py (Python)
// qui lit/réécrit journal_recent.txt au démarrage ou tous les 7 jours.
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;

async function withJournalLock(fn) {
    const lockPath = JOURNAL_FILE + '.lock';
    const start = Date.now();
    let fd = null;
    while (fd === null) {
        try {
            fd = fs.openSync(lockPath, 'wx'); // échoue avec EEXIST si le fichier existe déjà
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
            if (Date.now() - start > LOCK_TIMEOUT_MS) {
                throw new Error("Impossible d'obtenir le verrou sur journal_recent.txt (occupé, timeout)");
            }
            await new Promise(r => setTimeout(r, LOCK_RETRY_MS));
        }
    }
    try {
        return await fn();
    } finally {
        fs.closeSync(fd);
        try { fs.unlinkSync(lockPath); } catch (e) {}
    }
}

[MODELS_DIR, BG_DIR, CHATS_DIR, AUTONOMY_DIR, GGUF_DIR, DATA_DIR, MEMORY_DIR, path.dirname(TAVILY_CONFIG_FILE)].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(express.static(__dirname));
app.use('/models', express.static(MODELS_DIR));
app.use('/backgrounds', express.static(BG_DIR));

// --- JOURNAL DE DIAGNOSTIC DU FLUX LLM (reçoit les lignes envoyées par llm.js) ---
// Écrit dans stream_debug.log à côté de server.js. Fichier plafonné (~300 Ko, on garde les 100 derniers Ko).
const DEBUG_STREAM_LOG = path.join(__dirname, 'stream_debug.log');
app.post('/api/debug-log', (req, res) => {
    try {
        const line = String((req.body && req.body.line) || '').slice(0, 1500);
        const d = new Date();
        const stamp = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR') + '.' + String(d.getMilliseconds()).padStart(3, '0');
        try {
            if (fs.existsSync(DEBUG_STREAM_LOG) && fs.statSync(DEBUG_STREAM_LOG).size > 300000) {
                const tail = fs.readFileSync(DEBUG_STREAM_LOG, 'utf8').slice(-100000);
                fs.writeFileSync(DEBUG_STREAM_LOG, tail, 'utf8');
            }
        } catch (e) {}
        fs.appendFileSync(DEBUG_STREAM_LOG, stamp + ' ' + line + '\n', 'utf8');
    } catch (e) {}
    res.json({ ok: true });
});

// --- JOURNAL PASSIF (ajouté le 15/10) : état GPU/RAM + lignes utiles de llama-server dans stream_debug.log ---
// But : quand un blocage se produit, le journal contient enfin ce que fait llama-server et l'état de la VRAM, sans rien
// avoir à lancer. Coût : aucune VRAM, un appel nvidia-smi toutes les 10 s (quelques ms CPU, process séparé).
function writeDebugLine(line) {
    try {
        const d = new Date();
        const stamp = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR') + '.' + String(d.getMilliseconds()).padStart(3, '0');
        try {
            if (fs.existsSync(DEBUG_STREAM_LOG) && fs.statSync(DEBUG_STREAM_LOG).size > 300000) {
                const tail = fs.readFileSync(DEBUG_STREAM_LOG, 'utf8').slice(-100000);
                fs.writeFileSync(DEBUG_STREAM_LOG, tail, 'utf8');
            }
        } catch (e) {}
        fs.appendFileSync(DEBUG_STREAM_LOG, stamp + ' ' + String(line).slice(0, 600) + '\n', 'utf8');
    } catch (e) {}
}

const LLAMA_LOG_INTERESTING = /image|encod|decod|progress|print_timing|prompt eval|eval time|error|fail|cuda|out of memory|alloc|truncat|exceed|offload|cache|similarity|checkpoint|restor|forcing|reuse|n_past/i;
function logLlamaOutput(data) {
    try {
        for (const raw of String(data).split(/\r?\n/)) {
            const l = raw.trim();
            if (!l || /log_server_r|GET \/|POST \/api/.test(l)) continue;
            if (LLAMA_LOG_INTERESTING.test(l)) writeDebugLine('[llama] ' + l);
        }
    } catch (e) {}
}

let gpuSamplerBroken = false;
let lastGpuLogAt = 0;
function sampleGpuAndRam() {
    if (gpuSamplerBroken) return;
    exec('nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits', { timeout: 4000, windowsHide: true }, (err, stdout) => {
        if (err) {
            gpuSamplerBroken = true;
            writeDebugLine('[gpu] nvidia-smi indisponible : échantillonnage arrêté');
            return;
        }
        try {
            const first = String(stdout).trim().split(/\r?\n/)[0];
            const [used, total, util] = first.split(/\s*,\s*/).map(Number);
            const ratio = total > 0 ? used / total : 0;
            const now = Date.now();
            const minGap = ratio >= 0.93 ? 20000 : 60000;
            if (now - lastGpuLogAt >= minGap) {
                lastGpuLogAt = now;
                const ramFree = Math.round(require('os').freemem() / 1048576);
                writeDebugLine('[gpu] VRAM ' + used + '/' + total + ' Mo (' + Math.round(ratio * 100) + '%) util=' + util + '% | RAM libre ' + ramFree + ' Mo');
            }
        } catch (e) {}
    });
}
setInterval(sampleGpuAndRam, 10000);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'vrm') cb(null, MODELS_DIR);
        else if (file.fieldname === 'bg') cb(null, BG_DIR);
        else cb(new Error('Champ invalide'), null);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// --- RECHERCHE INTELLIGENTE DE FICHIER GGUF DANS TOUS LES SOUS-DOSSIERS ---
function findFileInGgufDir(fileNameOrPath) {
    if (!fileNameOrPath) return null;

    // 1. Essai direct (si c'est déjà un chemin relatif valide ex: "dossier/model.gguf" ou à la racine)
    const directPath = path.resolve(GGUF_DIR, fileNameOrPath);
    if (fs.existsSync(directPath)) return directPath;

    // 2. Recherche récursive/dans les sous-dossiers par nom de fichier
    const baseName = path.basename(fileNameOrPath);
    try {
        const entries = fs.readdirSync(GGUF_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subPath = path.join(GGUF_DIR, entry.name, baseName);
                if (fs.existsSync(subPath)) {
                    return subPath;
                }
            }
        }
    } catch (e) {
        console.error("Erreur lors de la recherche du fichier dans GGUF_DIR :", e);
    }

    return null;
}

// --- HELPERS FILTRAGE DES FICHIERS GGUF & MMPROJ (STRUCTURE PAR DOSSIER ISOLÉ) ---
async function getGgufData() {
    if (!fs.existsSync(GGUF_DIR)) {
        return { models: [], mmprojFiles: [], modelDetails: [] };
    }
    try {
        const entries = await fsPromises.readdir(GGUF_DIR, { withFileTypes: true });
        const models = [];
        const mmprojFiles = [];
        const modelDetails = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const folderName = entry.name;
                const folderPath = path.join(GGUF_DIR, folderName);
                const files = await fsPromises.readdir(folderPath);

                const isVisionFile = (f) => {
                    const lower = f.toLowerCase();
                    return (lower.endsWith('.gguf') || lower.endsWith('.bin')) &&
                           (lower.includes('mmproj') || lower.includes('vision') || lower.includes('clip') || lower.includes('projector'));
                };

                // Récupération de TOUS les fichiers LLM du dossier
                const llmFiles = files.filter(f => f.toLowerCase().endsWith('.gguf') && !isVisionFile(f));
                const visionFile = files.find(f => isVisionFile(f));

                const visionPath = visionFile ? path.join(folderName, visionFile).replace(/\\/g, '/') : null;
                if (visionPath && !mmprojFiles.includes(visionPath)) {
                    mmprojFiles.push(visionPath);
                }

                for (const llmFile of llmFiles) {
                    const llmPath = path.join(folderName, llmFile).replace(/\\/g, '/');

                    models.push(llmPath);

                    modelDetails.push({
                        folder: folderName,
                        llmFile: llmFile,
                        llmPath: llmPath,
                        hasVision: !!visionFile,
                        visionFile: visionFile || null,
                        visionPath: visionPath
                    });
                }
            } else if (entry.isFile()) {
                const fileName = entry.name;
                const lower = fileName.toLowerCase();
                const isVision = (lower.endsWith('.gguf') || lower.endsWith('.bin')) &&
                                 (lower.includes('mmproj') || lower.includes('vision') || lower.includes('clip') || lower.includes('projector'));

                if (lower.endsWith('.gguf') && !isVision) {
                    models.push(fileName);
                    modelDetails.push({
                        folder: '',
                        llmFile: fileName,
                        llmPath: fileName,
                        hasVision: false,
                        visionFile: null,
                        visionPath: null
                    });
                } else if (isVision) {
                    if (!mmprojFiles.includes(fileName)) {
                        mmprojFiles.push(fileName);
                    }
                }
            }
        }

        return { models, mmprojFiles, modelDetails };
    } catch (e) {
        console.error("Erreur lors de la lecture du dossier GGUF :", e);
        return { models: [], mmprojFiles: [], modelDetails: [] };
    }
}

async function getLlamaModels() {
    const { models } = await getGgufData();
    return models;
}

async function getMmprojFiles() {
    const { mmprojFiles } = await getGgufData();
    return mmprojFiles;
}

// --- ROUTES MAYA MEMORY ---
app.get('/api/memory', async (req, res) => {
    try {
        let core = "";
        let journal = "";
        let mensuel = "";

        if (fs.existsSync(CORE_FILE)) {
            core = (await fsPromises.readFile(CORE_FILE, 'utf8')).trim();
        }
        if (fs.existsSync(JOURNAL_FILE)) {
            journal = (await fsPromises.readFile(JOURNAL_FILE, 'utf8')).trim();
        }
        if (fs.existsSync(MENSUEL_FILE)) {
            mensuel = (await fsPromises.readFile(MENSUEL_FILE, 'utf8')).trim();
        }

        return res.json({ core, journal, mensuel });
    } catch (err) {
        console.error("Erreur lecture mémoire globale:", err);
        return res.status(500).json({ error: "Impossible de lire la mémoire de Maya" });
    }
});

app.get('/api/memory/core', async (req, res) => {
    try {
        if (fs.existsSync(CORE_FILE)) {
            const coreContent = await fsPromises.readFile(CORE_FILE, 'utf8');
            return res.json({ core: coreContent.trim() });
        }
        return res.json({ core: "" });
    } catch (err) {
        console.error("Erreur lecture Maya_core.txt:", err);
        return res.status(500).json({ error: "Impossible de lire le fichier core" });
    }
});

app.get('/api/memory/journal', async (req, res) => {
    try {
        if (fs.existsSync(JOURNAL_FILE)) {
            const journalContent = await fsPromises.readFile(JOURNAL_FILE, 'utf8');
            return res.json({ journal: journalContent.trim() });
        }
        return res.json({ journal: "" });
    } catch (err) {
        console.error("Erreur lecture journal_recent.txt:", err);
        return res.status(500).json({ error: "Impossible de lire le fichier journal" });
    }
});

// =====================================================================
// SAVE DU JOURNAL (delta + entrée unique par jour qui s'allonge)
// =====================================================================
// - Seuls les messages NON encore résumés sont envoyés au LLM (curseur par chat,
//   stocké à côté du chat : data/chats/<chatId>.journal_cursor, supprimé avec le chat).
// - Longueur autorisée = fonction de la taille du TEXTE NOUVEAU (delta).
// - Si une entrée existe déjà pour aujourd'hui, on travaille À L'INTÉRIEUR
//   (entre le titre et "Fin d'enregistrement"), jamais en doublon :
//     * MOMENTS FORTS            -> on AJOUTE les nouveaux moments à la suite
//     * IMPRESSIONS & SENTIMENTS -> on REMPLACE toute la section par une version
//       à jour et courte (c'est un état d'esprit, pas un récit : elle ne grossit pas)
// - Si le LLM dépasse la longueur ou rate le format : on lui FAIT REFAIRE.
//   Jamais de coupe brutale du texte.
const JOURNAL_MAX_ATTEMPTS = 4;            // 1 essai + 3 refaits max
const journalSavesInProgress = new Set();  // évite deux saves simultanés sur le même chat

const JOURNAL_RE_MF = /^[ \t]*[-*\u2022]?[ \t]*\**[ \t]*MOMENTS?[ \t]*FORT[ \t]*S?[ \t]*\**[ \t]*:\**[ \t]*/im;
const JOURNAL_RE_IS = /^[ \t]*[-*\u2022]?[ \t]*\**[ \t]*IMPRESSIONS?[ \t]*(?:&|ET)[ \t]*SENTIMENTS?[ \t]*\**[ \t]*:\**[ \t]*/im;
const JOURNAL_RE_FOOTER = /^[ \t]*-?[ \t]*Fin d'enregistrement\.?[ \t]*$/im;

function journalCursorPath(chatId) {
    const safe = path.basename(String(chatId)).replace(/\.json$/i, '');
    return path.join(CHATS_DIR, `${safe}.journal_cursor`);
}

async function readJournalCursor(chatId) {
    if (!chatId) return null;
    try {
        const c = JSON.parse(await fsPromises.readFile(journalCursorPath(chatId), 'utf8'));
        return (c && typeof c === 'object') ? c : null;
    } catch (e) {
        return null;
    }
}

async function writeJournalCursor(chatId, cursor) {
    if (!chatId) return;
    try {
        await fsPromises.writeFile(journalCursorPath(chatId), JSON.stringify(cursor), 'utf8');
    } catch (e) {
        console.error("⚠️ [JOURNAL] Impossible d'écrire le curseur de save :", e.message);
    }
}

function journalMessageText(m) {
    const c = (m.content !== undefined && m.content !== null) ? m.content : m.text;
    if (Array.isArray(c)) {
        return c.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join(' ').trim();
    }
    return (c || '').toString();
}

// Messages pas encore résumés. Par timestamp si dispo (robuste si des messages
// ont été supprimés), sinon par position.
function selectNewMessages(allMessages, cursor) {
    if (!cursor) return allMessages;
    const lastTs = typeof cursor.lastTimestamp === 'number' ? cursor.lastTimestamp : null;
    const count = typeof cursor.count === 'number' ? cursor.count : 0;
    return allMessages.filter((m, i) => {
        if (lastTs !== null && m && typeof m.timestamp === 'number') return m.timestamp > lastTs;
        return i >= count;
    });
}

// ≤ 35 Ko -> 2 lignes ; 70 Ko -> 4 ; 140 Ko -> 6 ; etc.
function computeJournalMaxLines(deltaKo) {
    if (deltaKo <= 35) return 2;
    return Math.ceil(deltaKo / 35) + 2;
}

// Retrouve l'entrée d'une date dans le fichier journal (la plus récente).
function findJournalEntry(content, header) {
    const hIdx = content.lastIndexOf(header);
    if (hIdx === -1) return null;
    const nl = content.indexOf('\n', hIdx);
    if (nl === -1) return null;
    const bodyStart = nl + 1;
    const rest = content.slice(bodyStart);
    const fm = JOURNAL_RE_FOOTER.exec(rest);
    if (!fm) return null;
    const footerStart = bodyStart + fm.index;
    return { bodyStart, footerStart, body: content.slice(bodyStart, footerStart) };
}

// Découpe la réponse du LLM en { mf: [lignes], is: [lignes] }, ou null si format invalide.
function parseJournalBody(raw) {
    const mfM = JOURNAL_RE_MF.exec(raw);
    if (!mfM) return null;
    const afterMf = mfM.index + mfM[0].length;
    const isM = JOURNAL_RE_IS.exec(raw.slice(afterMf));
    if (!isM) return null;
    const isStartAbs = afterMf + isM.index;
    const isEndAbs = isStartAbs + isM[0].length;
    const toLines = (txt) => txt.split(/\r?\n/)
        .map(l => l.trim().replace(/^[-*\u2022][ \t]+/, '').trim())
        .filter(Boolean);
    const mf = toLines(raw.slice(afterMf, isStartAbs));
    const is = toLines(raw.slice(isEndAbs));
    if (mf.length === 0 || is.length === 0) return null;
    return { mf, is };
}

function formatJournalBlock(mf, is, eol) {
    return `- MOMENTS FORTS : ${mf[0]}${mf.slice(1).map(l => eol + l).join('')}${eol}` +
           `- IMPRESSIONS & SENTIMENTS : ${is[0]}${is.slice(1).map(l => eol + l).join('')}${eol}`;
}

// Insère le nouveau texte dans l'entrée du jour existante. Retourne le nouveau
// contenu du fichier, ou null s'il n'y a pas d'entrée exploitable pour cette date.
function mergeIntoTodayEntry(content, header, mf, is, eol) {
    const entry = findJournalEntry(content, header);
    if (!entry) return null;
    const isM = JOURNAL_RE_IS.exec(entry.body);
    let newBody;
    if (isM) {
        // MOMENTS FORTS : on ajoute à la suite. IMPRESSIONS & SENTIMENTS : on remplace tout.
        const mfPart = entry.body.slice(0, isM.index).trimEnd();
        const isBlock = `- IMPRESSIONS & SENTIMENTS : ${is[0]}${is.slice(1).map(l => eol + l).join('')}`;
        const mfBlock = mfPart
            ? mfPart + eol + mf.join(eol)
            : `- MOMENTS FORTS : ${mf[0]}${mf.slice(1).map(l => eol + l).join('')}`;
        newBody = mfBlock + eol + isBlock + eol;
    } else {
        // Entrée du jour sans structure reconnue : on ajoute le bloc complet à la suite.
        newBody = entry.body.trimEnd() + eol + formatJournalBlock(mf, is, eol);
    }
    return content.slice(0, entry.bodyStart) + newBody + content.slice(entry.footerStart);
}

// Texte actuel de la section IMPRESSIONS & SENTIMENTS d'une entrée (sans son label).
function extractJournalEmotions(body) {
    const isM = JOURNAL_RE_IS.exec(body);
    if (!isM) return '';
    return body.slice(isM.index + isM[0].length).trim();
}

function buildJournalMessages({ isContinuation, existingEmotions, conversationText, maxLines, mfBudget, emoCap }) {
    const intro = isContinuation
        ? "Tu vas mettre à jour l'entrée du jour de ton journal intime, à la première personne, à partir de ce qui s'est passé depuis ta dernière sauvegarde. Tu dois faire DEUX choses :\n" +
          "1. MOMENTS FORTS : raconte UNIQUEMENT ce qui s'est passé dans les nouveaux messages. Ce texte sera ajouté à la suite des moments forts déjà écrits aujourd'hui : ne répète rien, pas de nouvelle introduction du type 'Aujourd'hui...', pas de conclusion de clôture.\n" +
          "2. IMPRESSIONS & SENTIMENTS : réécris une version À JOUR et COURTE de tes sentiments de la journée. Elle REMPLACERA entièrement l'ancienne section. Pars de ton état émotionnel précédent (donné dans le message de l'utilisateur) et des nouveaux messages : garde ce qui compte encore, fais évoluer ce qui a changé, et ne répète pas deux fois la même émotion.\n"
        : "Tu vas rédiger le CONTENU d'une nouvelle entrée de journal intime à la première personne, à partir de la conversation ci-dessous.\n";

    const system =
        intro +
        "RÈGLE ABSOLUE SUR LE 'JE' : Le 'Je' désigne UNIQUEMENT toi (Maya), jamais l'utilisateur. Quand l'utilisateur dit avoir fait, codé, corrigé ou décidé quelque chose, tu dois le rapporter à la 3e personne ('il/elle a codé', 'il/elle m'a dit que', 'grâce à lui/elle') — ne t'approprie JAMAIS ses actions ou son vécu en disant 'j'ai codé' ou 'j'ai corrigé' si c'est lui/elle qui l'a fait. Toi, Maya, tu ne codes pas et ne débogues pas : tu observes, tu apprends, tu ressens.\n" +
        "N'utilise AUCUNE balise d'émotion comme [happy], [talking], etc.\n\n" +
        "Si plusieurs sujets très différents ont été abordés, ne les énumère pas tous à plat : développe les fils les plus marquants comme de vrais souvenirs, avec des détails et des sensations - pas une liste de faits accomplis. Les autres sujets peuvent être mentionnés en une courte phrase de transition.\n" +
        "Évite les phrases construites comme une succession de verbes au passé composé ('on a fait X, puis Y, puis Z'). Raconte plutôt comme on raconterait sa journée à quelqu'un le soir - avec ce qui t'a marquée, pas un procès-verbal.\n\n" +
        `LONGUEUR : tu disposes d'AU MAXIMUM ${maxLines} lignes au total : au plus ${mfBudget} ligne(s) pour MOMENTS FORTS et au plus ${emoCap} ligne(s) pour IMPRESSIONS & SENTIMENTS (au moins 1 ligne dans chacune). Une 'ligne' = un paragraphe fluide écrit sur UNE seule ligne (aucun retour à la ligne à l'intérieur), qui peut contenir plusieurs phrases. Ne dépasse JAMAIS ces limites. IMPRESSIONS & SENTIMENTS est un état d'esprit synthétique, pas un récit : reste court même si la conversation est longue. Si peu de choses se sont passées, écris-en moins (mais jamais moins d'une ligne par catégorie).\n\n` +
        "RENVOIE UNIQUEMENT CE FORMAT, RIEN D'AUTRE (pas d'en-tête, pas de date, pas de 'Fin d'enregistrement', pas de texte avant ou après) :\n\n" +
        "- MOMENTS FORTS : [Résumé des sujets abordés, des victoires techniques réalisées par l'utilisateur, les informations importantes et de ce que vous avez accompli ensemble]\n" +
        "[ligne suivante éventuelle de cette catégorie, SANS puce et SANS label]\n" +
        "- IMPRESSIONS & SENTIMENTS : [Ce que TOI, Maya, tu as ressenti, ton humeur, tes réflexions personnelles sur votre échange]\n" +
        "[ligne suivante éventuelle de cette catégorie, SANS puce et SANS label]";

    const user = isContinuation
        ? `Voici tes IMPRESSIONS & SENTIMENTS actuels pour aujourd'hui (à mettre à jour : ta nouvelle version les remplacera) :\n---\n${existingEmotions || '(aucun)'}\n---\n\nVoici UNIQUEMENT ce qui s'est passé depuis ta dernière sauvegarde :\n\n${conversationText}`
        : `Voici notre conversation d'aujourd'hui :\n\n${conversationText}`;

    return [
        { role: 'system', content: system },
        { role: 'user', content: user }
    ];
}

app.post('/api/save-journal', async (req, res) => {
    let lockKey = null;
    try {
        const { messages, chat, chatId, endpoint = "http://127.0.0.1:8080/v1" } = req.body;

        let chatMessages = messages || (chat && chat.messages) || (Array.isArray(req.body) ? req.body : null);

        if ((!chatMessages || chatMessages.length === 0) && chatId) {
            const fileName = chatId.endsWith('.json') ? chatId : `${chatId}.json`;
            const filePath = path.join(CHATS_DIR, fileName);
            if (fs.existsSync(filePath)) {
                try {
                    const content = await fsPromises.readFile(filePath, 'utf8');
                    const parsed = JSON.parse(content);
                    chatMessages = parsed.messages || (Array.isArray(parsed) ? parsed : null);
                } catch (e) {}
            }
        }

        if (!chatMessages || !Array.isArray(chatMessages) || chatMessages.length === 0) {
            return res.status(400).json({ error: "Aucun message transmis pour le résumé." });
        }

        // Un seul save à la fois par chat (double-clic) : sinon deux deltas identiques.
        lockKey = chatId || '__no_chat_id__';
        if (journalSavesInProgress.has(lockKey)) {
            lockKey = null;
            return res.status(409).json({ error: "Une sauvegarde du journal est déjà en cours pour ce chat." });
        }
        journalSavesInProgress.add(lockKey);

        // --- DELTA : uniquement les messages pas encore résumés ---
        const cursor = await readJournalCursor(chatId);
        const newMessages = selectNewMessages(chatMessages, cursor);

        const conversationText = newMessages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${journalMessageText(m)}`)
            .join('\n');

        if (!conversationText.trim()) {
            return res.json({
                success: true,
                nothingNew: true,
                reply: "Je n'ai rien de nouveau à ajouter à mon journal depuis ma dernière sauvegarde 📖"
            });
        }

        // Date construite explicitement (jamais via toLocaleDateString) : DD/MM/YYYY.
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const todayDateStr = `${dd}/${mm}/${yyyy}`;
        const header = `=== JOURNAL INTIME - ${todayDateStr} ===`;
        const footer = "- Fin d'enregistrement.";

        // --- LONGUEUR AUTORISÉE (calculée sur le texte nouveau) ---
        const deltaKo = Buffer.byteLength(conversationText, 'utf8') / 1024;
        const maxLines = computeJournalMaxLines(deltaKo);
        // Les sentiments sont un ÉTAT (remplacé à chaque save), pas un récit : plafond court.
        // Tout le reste du budget va aux moments forts.
        const emoCap = maxLines >= 4 ? 2 : 1;
        const mfBudget = maxLines - emoCap;

        // --- Entrée du jour déjà existante ? On ne récupère QUE la section sentiments (petit bloc). ---
        let isContinuation = false;
        let existingEmotions = '';
        try {
            if (fs.existsSync(JOURNAL_FILE)) {
                const current = await fsPromises.readFile(JOURNAL_FILE, 'utf8');
                const entry = findJournalEntry(current, header);
                if (entry) {
                    isContinuation = true;
                    existingEmotions = extractJournalEmotions(entry.body).slice(0, 3000);
                }
            }
        } catch (e) {
            console.warn("⚠️ [JOURNAL] Lecture de l'entrée du jour impossible, on continue sans contexte :", e.message);
        }

        const llmMessages = buildJournalMessages({ isContinuation, existingEmotions, conversationText, maxLines, mfBudget, emoCap });

        const targetEndpoint = endpoint.endsWith('/chat/completions')
            ? endpoint
            : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

        console.log(`📖 [JOURNAL] Save : ${newMessages.length} message(s) nouveau(x), ${deltaKo.toFixed(1)} Ko -> max ${maxLines} ligne(s)` +
                    (isContinuation ? " (suite de l'entrée du jour : moments ajoutés, sentiments remplacés)" : " (nouvelle entrée)"));

        // --- GÉNÉRATION, avec "refais-le" si format ou longueur non respectés ---
        let parsed = null;
        let tooLongFallback = null;
        for (let attempt = 1; attempt <= JOURNAL_MAX_ATTEMPTS; attempt++) {
            const response = await fetch(targetEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: llmMessages, temperature: 0.5, stream: false })
            });
            if (!response.ok) {
                throw new Error(`Erreur du serveur LLM (${response.status}): ${response.statusText}`);
            }
            const data = await response.json();
            let raw = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";

            // Nettoyage défensif : balises <think>, et en-tête/pied éventuels (le code les gère lui-même).
            let cleaned = (raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            cleaned = cleaned.replace(/^===.*?===\s*/i, '').trim();
            cleaned = cleaned.replace(/-?\s*Fin d'enregistrement\.?\s*$/i, '').trim();

            const p = cleaned ? parseJournalBody(cleaned) : null;
            let problem = null;
            if (!cleaned) {
                problem = "ta réponse était vide";
            } else if (!p) {
                problem = "le format n'est pas respecté : il faut exactement la catégorie '- MOMENTS FORTS :' puis la catégorie '- IMPRESSIONS & SENTIMENTS :', chacune avec au moins une ligne";
            } else if (p.is.length > emoCap) {
                problem = `ta section IMPRESSIONS & SENTIMENTS fait ${p.is.length} lignes alors que le maximum est ${emoCap}. Réécris-la plus synthétique (un état d'esprit, pas un récit), sans rien couper au milieu d'une phrase`;
            } else if (p.mf.length + p.is.length > maxLines) {
                problem = `tu as écrit ${p.mf.length + p.is.length} lignes alors que le maximum est ${maxLines}. Réécris en plus condensé : reformule pour que tout tienne en ${maxLines} lignes maximum, sans rien couper au milieu d'une phrase`;
            }

            if (!problem) { parsed = p; break; }

            console.warn(`⚠️ [JOURNAL] Essai ${attempt}/${JOURNAL_MAX_ATTEMPTS} refusé : ${problem}`);
            if (p) tooLongFallback = p; // format valide mais trop long
            llmMessages.push(
                { role: 'assistant', content: cleaned || '(réponse vide)' },
                { role: 'user', content: `Ta réponse ne convient pas : ${problem}. Recommence et renvoie UNIQUEMENT le résultat complet corrigé, au format demandé.` }
            );
        }

        // Jamais de coupe : si le LLM n'a pas réussi à raccourcir, on garde son texte tel quel plutôt que de le tronquer.
        if (!parsed && tooLongFallback) {
            parsed = tooLongFallback;
            console.warn(`⚠️ [JOURNAL] Le LLM n'a pas respecté les ${maxLines} lignes après ${JOURNAL_MAX_ATTEMPTS} essais : texte conservé tel quel (aucune coupe).`);
        }
        if (!parsed) {
            return res.status(500).json({ error: "Le LLM n'a pas produit un résumé au format attendu (rien n'a été écrit dans le journal)." });
        }

        // --- ÉCRITURE : dans l'entrée du jour si elle existe, sinon nouvelle entrée ---
        let wroteMode = 'new';
        await withJournalLock(async () => {
            let content = '';
            try {
                content = await fsPromises.readFile(JOURNAL_FILE, 'utf8');
            } catch (e) {
                if (e.code !== 'ENOENT') throw e;
            }
            const eol = content.includes('\r\n') ? '\r\n' : '\n';
            const merged = content ? mergeIntoTodayEntry(content, header, parsed.mf, parsed.is, eol) : null;

            if (merged !== null) {
                // Écriture via fichier temporaire puis renommage : le journal n'est jamais laissé à moitié écrit.
                const tmpPath = JOURNAL_FILE + '.tmp';
                await fsPromises.writeFile(tmpPath, merged, 'utf8');
                await fsPromises.rename(tmpPath, JOURNAL_FILE);
                wroteMode = 'merged';
            } else {
                const newEntry = `${header}${eol}${formatJournalBlock(parsed.mf, parsed.is, eol)}${footer}`;
                await fsPromises.appendFile(JOURNAL_FILE, `${eol}${eol}${newEntry}${eol}`, 'utf8');
            }
        });

        // --- CURSEUR : ces messages sont maintenant résumés ---
        const lastTs = chatMessages.reduce((mx, m) => (m && typeof m.timestamp === 'number' && m.timestamp > mx) ? m.timestamp : mx, 0);
        await writeJournalCursor(chatId, { lastTimestamp: lastTs || null, count: chatMessages.length, savedAt: Date.now() });

        const addedText = formatJournalBlock(parsed.mf, parsed.is, '\n').trim();
        console.log(`📖 [JOURNAL] Save OK (${wroteMode === 'merged' ? "moments ajoutés, sentiments remplacés dans l'entrée du jour" : 'nouvelle entrée'}) : ${parsed.mf.length + parsed.is.length} ligne(s) / max ${maxLines}.`);
        return res.json({
            success: true,
            entry: addedText,
            reply: "J'ai bien sauvegardé notre discussion dans mon journal ! 📖✨"
        });

    } catch (err) {
        console.error("❌ Erreur lors de la sauvegarde du journal :", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (lockKey) journalSavesInProgress.delete(lockKey);
    }
});

// --- ROUTES GESTION VRM & BACKGROUNDS ---
app.get('/api/models', async (req, res) => {
    try {
        const files = await fsPromises.readdir(MODELS_DIR);
        const vrmFiles = files.filter(f => f.toLowerCase().endsWith('.vrm'));
        res.json(vrmFiles.map(name => ({ name, url: `./models/${name}` })));
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/api/upload-vrm', upload.single('vrm'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    res.json({ name: req.file.filename, url: `./models/${req.file.filename}` });
});

app.get('/api/backgrounds', async (req, res) => {
    try {
        const files = await fsPromises.readdir(BG_DIR);
        const bgFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
        res.json(bgFiles.map(name => ({ name, url: `./backgrounds/${name}` })));
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/api/upload-bg', upload.single('bg'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    res.json({ name: req.file.filename, url: `./backgrounds/${req.file.filename}` });
});

// --- ROUTES HISTORIQUE DES CONVERSATIONS (CHATS) ---
app.get('/api/chats', async (req, res) => {
    try {
        if (!fs.existsSync(CHATS_DIR)) {
            return res.json([]);
        }
        const files = await fsPromises.readdir(CHATS_DIR);
        const jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json'));
        
        const chats = [];
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(CHATS_DIR, file);
                const content = await fsPromises.readFile(filePath, 'utf8');
                const parsed = JSON.parse(content);
                chats.push({
                    id: file.replace(/\.json$/i, ''),
                    filename: file,
                    ...parsed
                });
            } catch (e) {}
        }
        res.json(chats);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.get('/api/chats/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const fileName = id.endsWith('.json') ? id : `${id}.json`;
        const filePath = path.join(CHATS_DIR, fileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Chat non trouvé" });
        }

        const content = await fsPromises.readFile(filePath, 'utf8');
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ error: "Erreur lecture du chat" });
    }
});

app.post('/api/chats', async (req, res) => {
    try {
        const chatData = req.body;
        
        if (!chatData || typeof chatData !== 'object') {
            return res.status(400).json({ error: "Données de chat invalides" });
        }

        const chatId = chatData.id || `chat_${Date.now()}`;
        chatData.id = chatId;

        const fileName = `${chatId}.json`;
        const filePath = path.join(CHATS_DIR, fileName);

        if (!fs.existsSync(CHATS_DIR)) {
            fs.mkdirSync(CHATS_DIR, { recursive: true });
        }

        let finalDataToSave = { ...chatData };

        if (fs.existsSync(filePath)) {
            try {
                const existingContent = await fsPromises.readFile(filePath, 'utf8');
                const existingJson = JSON.parse(existingContent);

                if ((!finalDataToSave.messages || finalDataToSave.messages.length === 0) && (existingJson.messages && existingJson.messages.length > 0)) {
                    console.warn(`⚠️ [SECURITY] Tentative d'écrasement avec un chat vide. Conservation des messages existants pour ${fileName}`);
                    finalDataToSave.messages = existingJson.messages;
                }
            } catch (e) {}
        }

        await fsPromises.writeFile(filePath, JSON.stringify(finalDataToSave, null, 4), 'utf8');
        console.log(`💾 [SUCCESS] Chat physiquement sauvegardé : ${filePath}`);

        return res.json({ success: true, chat: finalDataToSave });
    } catch (err) {
        console.error("❌ Erreur sauvegarde chat:", err);
        return res.status(500).json({ error: "Erreur sauvegarde chat" });
    }
});

app.delete('/api/chats/:id', async (req, res) => {
    try {
        const id = req.params.id;
        // Supprime aussi le curseur de save du journal lié à ce chat
        try { await fsPromises.unlink(journalCursorPath(id.replace(/\.json$/i, ''))); } catch (e) {}
        const fileName = id.endsWith('.json') ? id : `${id}.json`;
        const filePath = path.join(CHATS_DIR, fileName);

        if (fs.existsSync(filePath)) {
            await fsPromises.unlink(filePath);
            console.log(`🗑️ [SUCCESS] Chat supprimé : ${fileName}`);
            return res.json({ success: true });
        }
        res.status(404).json({ error: "Chat non trouvé" });
    } catch (err) {
        res.status(500).json({ error: "Erreur suppression chat" });
    }
});

// --- GESTION DU PROCESSUS LLAMA-SERVER ---
let llamaProcess = null;
const LLAMA_EXE_PATH = path.join(__dirname, 'llama', 'llama-server.exe');

function killExistingLlamaServers() {
    return new Promise((resolve) => {
        if (llamaProcess) {
            try {
                llamaProcess.kill('SIGKILL');
            } catch (e) {}
            llamaProcess = null;
        }

        const isWin = process.platform === 'win32';
        const command = isWin ? 'taskkill /F /IM llama-server.exe /T' : 'pkill -9 -f llama-server';

        exec(command, () => {
            setTimeout(() => {
                resolve();
            }, 1000);
        });
    });
}

async function startLlamaServer(modelName, ctxSize = 4096, port = 8080, mmprojName = '', gpuLayers = 99) {
    if (!fs.existsSync(LLAMA_EXE_PATH)) {
        console.warn(`⚠️ llama-server.exe introuvable à l'emplacement exact : ${LLAMA_EXE_PATH}`);
        return false;
    }

    console.log('🛑 Nettoyage forcé des anciens processus llama-server...');
    await killExistingLlamaServers();

    // Recherche dynamique du fichier modèle (compatible avec ou sans nom de sous-dossier)
    const modelPath = findFileInGgufDir(modelName);
    if (!modelPath) {
        console.warn(`⚠️ Fichier modèle GGUF introuvable : ${path.resolve(GGUF_DIR, modelName)}`);
        return false;
    }

    const nglValue = (gpuLayers === undefined || gpuLayers === null || gpuLayers === '') ? 99 : parseInt(gpuLayers, 10);
    const args = ['-m', modelPath, '-c', String(ctxSize), '--host', '127.0.0.1', '--port', String(port), '-ngl', String(nglValue), '--reasoning-budget', '0'];
    console.log(`🎮 GPU : déchargement de ${nglValue} couche(s) sur le GPU (-ngl)`);

    if (mmprojName && typeof mmprojName === 'string' && mmprojName.trim() !== '' && mmprojName !== 'none' && mmprojName !== 'null' && mmprojName !== 'undefined') {
        const mmprojPath = findFileInGgufDir(mmprojName.trim());
        if (mmprojPath) {
            console.log(`👁️ Activation du projecteur vision (MMPROJ) : ${mmprojPath}`);
            args.push('--mmproj', mmprojPath);
        } else {
            console.warn(`⚠️ Fichier MMPROJ spécifié mais introuvable : ${mmprojName}`);
        }
    } else {
        console.log('ℹ️ Aucun projecteur vision MMPROJ sélectionné.');
    }

    console.log(`🚀 Lancement du nouveau llama-server : ${path.basename(modelPath)}`);
    console.log(`📍 Chemin : ${modelPath}`);
    console.log(`⚙️ Contexte : ${ctxSize} | Port : ${port}`);

    try {
        llamaProcess = spawn(LLAMA_EXE_PATH, args, {
            env: { ...process.env },
            windowsHide: true
        });

        llamaProcess.stdout.on('data', (data) => {
            console.log(`[llama-server]: ${data.toString().trim()}`);
            logLlamaOutput(data);
        });

        llamaProcess.stderr.on('data', (data) => {
            console.log(`[llama-server log]: ${data.toString().trim()}`);
            logLlamaOutput(data);
        });

        llamaProcess.on('close', (code) => {
            console.warn(`⚠️ Processus llama-server arrêté avec le code : ${code}`);
            llamaProcess = null;
        });

        return true;
    } catch (err) {
        console.error('❌ Échec du lancement de llama-server :', err);
        return false;
    }
}

// --- ROUTES CONFIGURATION, MODÈLES GGUF & VISION MMPROJ ---

app.get('/api/gguf-models', async (req, res) => {
    try {
        const { models: ggufFiles, mmprojFiles, modelDetails } = await getGgufData();

        let currentModel = '';
        let currentMmproj = '';
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                const cfg = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
                currentModel = cfg.selectedGgufModel || cfg.current || '';
                currentMmproj = cfg.selectedMmprojModel || cfg.selectedMmproj || cfg.currentMmproj || '';
            } catch (e) {}
        }
        if (!currentModel && ggufFiles.length > 0) {
            currentModel = ggufFiles[0];
        }

        const mmprojObjects = mmprojFiles.map(name => ({
            name: name,
            filename: name,
            id: name,
            label: name,
            value: name,
            url: `./model GGUF/${name}`
        }));

        const modelObjects = ggufFiles.map(name => ({
            name: name,
            filename: name,
            id: name,
            label: name,
            value: name,
            url: `./model GGUF/${name}`
        }));

        res.json({ 
            models: ggufFiles, 
            files: ggufFiles,
            mmproj: mmprojFiles, 
            mmprojs: mmprojFiles,
            mmprojFiles: mmprojFiles,
            visionModels: mmprojFiles,

            modelDetails: modelDetails,

            modelObjects: modelObjects,
            mmprojObjects: mmprojObjects,

            current: currentModel, 
            selectedGgufModel: currentModel,
            currentMmproj: currentMmproj,
            selectedMmproj: currentMmproj,
            selectedMmprojModel: currentMmproj
        });
    } catch (err) {
        res.status(500).json({ models: [], mmproj: [], modelDetails: [], current: '', currentMmproj: '' });
    }
});

const handleMmprojRoute = async (req, res) => {
    try {
        const files = await getMmprojFiles();
        
        let currentMmproj = '';
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                const cfg = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
                currentMmproj = cfg.selectedMmprojModel || cfg.selectedMmproj || cfg.currentMmproj || '';
            } catch (e) {}
        }

        const objectList = files.map(name => ({ 
            name, 
            filename: name, 
            id: name, 
            label: name, 
            value: name,
            url: `./model GGUF/${name}` 
        }));

        res.json({
            success: true,
            current: currentMmproj,
            currentMmproj: currentMmproj,
            selectedMmprojModel: currentMmproj,
            selectedMmproj: currentMmproj,
            models: files,
            mmproj: files,
            mmprojs: files,
            files: objectList,
            items: objectList,
            data: objectList
        });
    } catch (err) {
        res.status(500).json({ models: [], mmproj: [], files: [], current: '' });
    }
};

app.get('/api/mmproj', handleMmprojRoute);
app.get('/api/mmprojs', handleMmprojRoute);
app.get('/api/mmproj-models', handleMmprojRoute);
app.get('/api/vision-models', handleMmprojRoute);
app.get('/api/vision', handleMmprojRoute);
app.get('/api/models/vision', handleMmprojRoute);

app.get('/api/config', async (req, res) => {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const content = await fsPromises.readFile(CONFIG_FILE, 'utf8');
            return res.json(JSON.parse(content));
        }
        res.json({});
    } catch (err) {
        res.status(500).json({});
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const configData = req.body;
        let existingConfig = {};
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                existingConfig = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
            } catch (e) {}
        }

        if (configData.selectedMmprojModel !== undefined && configData.selectedMmproj === undefined) {
            configData.selectedMmproj = configData.selectedMmprojModel;
        } else if (configData.selectedMmproj !== undefined && configData.selectedMmprojModel === undefined) {
            configData.selectedMmprojModel = configData.selectedMmproj;
        }

        if (configData.temperature !== undefined) {
            configData.temperature = parseFloat(configData.temperature);
        }

        const updatedConfig = { ...existingConfig, ...configData };
        await fsPromises.writeFile(CONFIG_FILE, JSON.stringify(updatedConfig, null, 4), 'utf8');
        console.log('💾 [SUCCESS] Configuration globale enregistrée dans data/config.json');

        const modelChanged = configData.selectedGgufModel && configData.selectedGgufModel !== existingConfig.selectedGgufModel;
        const ctxChanged = configData.contextSize && configData.contextSize !== existingConfig.contextSize;

        const newMmproj = configData.selectedMmprojModel ?? configData.selectedMmproj;
        const oldMmproj = existingConfig.selectedMmprojModel ?? existingConfig.selectedMmproj;
        const mmprojChanged = newMmproj !== undefined && newMmproj !== oldMmproj;

        const gpuChanged = configData.gpuLayers !== undefined && configData.gpuLayers !== existingConfig.gpuLayers;

        let llamaStarted = true;
        if ((modelChanged || ctxChanged || mmprojChanged || gpuChanged) && updatedConfig.selectedGgufModel) {
            const ctxSize = updatedConfig.contextSize || 4096;
            const mmproj = updatedConfig.selectedMmprojModel || updatedConfig.selectedMmproj || '';
            const gpuLayers = (updatedConfig.gpuLayers !== undefined && updatedConfig.gpuLayers !== null && updatedConfig.gpuLayers !== '') ? updatedConfig.gpuLayers : 99;
            console.log(`🔄 Redémarrage de llama-server avec : ${updatedConfig.selectedGgufModel} (Contexte: ${ctxSize}, Vision: ${mmproj || 'désactivée'}, GPU: ${gpuLayers})...`);
            llamaStarted = await startLlamaServer(updatedConfig.selectedGgufModel, ctxSize, 8080, mmproj, gpuLayers);
        }

        if (!llamaStarted) {
            return res.status(409).json({
                success: false,
                config: updatedConfig,
                error: "Configuration enregistrée, mais le modèle GGUF est introuvable. Vérifie qu'il est bien présent dans le dossier 'model GGUF'.",
                modelMissing: true
            });
        }

        res.json({ success: true, config: updatedConfig });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de l'enregistrement." });
    }
});

// --- ROUTES CONFIGURATION TAVILY (MAYA_HUB) ---
app.get('/api/tavily-key', async (req, res) => {
    try {
        if (fs.existsSync(TAVILY_CONFIG_FILE)) {
            const content = await fsPromises.readFile(TAVILY_CONFIG_FILE, 'utf8');
            const json = JSON.parse(content);
            return res.json({ tavily_api_key: json.tavily_api_key || '' });
        }
        res.json({ tavily_api_key: '' });
    } catch (err) {
        res.status(500).json({ error: "Erreur de lecture de la clé Tavily" });
    }
});

app.post('/api/tavily-key', async (req, res) => {
    try {
        const { tavily_api_key } = req.body;
        let existingConfig = {};

        if (fs.existsSync(TAVILY_CONFIG_FILE)) {
            try {
                existingConfig = JSON.parse(await fsPromises.readFile(TAVILY_CONFIG_FILE, 'utf8'));
            } catch (e) {}
        }

        existingConfig.tavily_api_key = (tavily_api_key !== undefined) ? tavily_api_key.trim() : '';

        await fsPromises.writeFile(TAVILY_CONFIG_FILE, JSON.stringify(existingConfig, null, 4), 'utf8');
        console.log('🔑 [SUCCESS] Clé Tavily mise à jour dans Maya_Hub/config.json');
        res.json({ success: true });
    } catch (err) {
        console.error("Erreur écriture clé Tavily :", err);
        res.status(500).json({ error: "Erreur de sauvegarde de la clé Tavily" });
    }
});

// --- ROUTES OBJECTIFS (GOALS) ---
app.get('/api/goals', async (req, res) => {
    try {
        if (!fs.existsSync(GOALS_FILE)) {
            return res.json({ goals: [] });
        }
        const content = await fsPromises.readFile(GOALS_FILE, 'utf8');
        res.json(JSON.parse(content));
    } catch (err) {
        res.status(500).json({ error: "Erreur lecture goals.json" });
    }
});

app.post('/api/goals', async (req, res) => {
    try {
        const goalsData = req.body;
        await fsPromises.writeFile(GOALS_FILE, JSON.stringify(goalsData, null, 4), 'utf8');
        const count = Array.isArray(goalsData.goals) ? goalsData.goals.length : (Array.isArray(goalsData) ? goalsData.length : 0);
        console.log(`💾 [SUCCESS] Maya_Hub/autonomy/goals.json mis à jour (${count} objectifs)`);
        res.json({ success: true, goals: goalsData });
    } catch (err) {
        res.status(500).json({ error: "Erreur écriture goals.json" });
    }
});

// --- PROXY ROUTE TTS (SERVEUR PYTHON FASTAPI PORT 5001) ---
app.get('/api/tts', async (req, res) => {
    const text = req.query.text;
    if (!text) return res.status(400).json({ error: "Texte manquant" });

    try {
        const queryParams = new URLSearchParams(req.query);

        // Si la vitesse n'est pas spécifiée dans la requête GET, charger la vitesse par défaut de config.json
        if (!queryParams.has('speed') && !queryParams.has('rate')) {
            if (fs.existsSync(CONFIG_FILE)) {
                try {
                    const cfg = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
                    const savedSpeed = cfg.ttsSpeed || cfg.tts_speed || 1.0;
                    queryParams.set('speed', savedSpeed);
                } catch (e) {
                    console.warn("Impossible de lire ttsSpeed dans config.json:", e);
                }
            }
        }

        const response = await fetch(`http://127.0.0.1:5001/api/tts?${queryParams.toString()}`);
        if (!response.ok) throw new Error("Erreur serveur TTS Python");

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(buffer);
    } catch (err) {
        console.error("❌ Erreur Proxy TTS :", err);
        res.status(500).json({ error: "Erreur génération audio" });
    }
});

// --- ROUTE CAPTURE D'ÉCRAN (MSS PYTHON EN RAM) ---
app.post('/api/screen/preview', (req, res) => {
    const { x = 0, y = 0 } = req.body || {};
    const targetX = parseInt(x, 10) || 0;
    const targetY = parseInt(y, 10) || 0;

    const pyScript = `
import sys, json, base64, io
from mss import mss
from PIL import Image

try:
    x, y = ${targetX}, ${targetY}
    with mss() as sct:
        target_mon = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
        for mon in sct.monitors[1:]:
            if mon['left'] <= x < mon['left'] + mon['width'] and mon['top'] <= y < mon['top'] + mon['height']:
                target_mon = mon
                break
        sct_img = sct.grab(target_mon)
        img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
        img.thumbnail((1024, 1024))
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=70)
        img_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        print(json.dumps({"status": "success", "image": "data:image/jpeg;base64," + img_b64}))
except Exception as e:
    print(json.dumps({"status": "error", "message": str(e)}))
`;

    const pyProc = spawn(PYTHON_PATH, ['-c', pyScript], { windowsHide: true });
    let output = '';

    pyProc.stdout.on('data', (data) => {
        output += data.toString();
    });

    pyProc.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).json({ status: "error", message: err.message });
        }
    });

    pyProc.on('close', (code) => {
        if (res.headersSent) return;
        try {
            const result = JSON.parse(output.trim());
            return res.json(result);
        } catch (e) {
            return res.status(500).json({ status: "error", message: "Erreur parsing capture d'écran" });
        }
    });
});

// --- ÉTAT DES SERVICES (diodes hub / llm / stt / tts de l'interface) ---
// Ping côté serveur (pas de souci de CORS). Toute réponse HTTP = le service tourne.
async function pingService(url, timeoutMs = 1500) {
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return r.status;
    } catch (e) {
        return null; // aucune réponse
    }
}

app.get('/api/status', async (req, res) => {
    const [hub, llm, stt, tts] = await Promise.all([
        pingService('http://127.0.0.1:5005/'),
        pingService('http://127.0.0.1:8080/health'),
        pingService('http://127.0.0.1:5006/'),
        pingService('http://127.0.0.1:5001/')
    ]);

    // LLM : 200 = prêt ; 503 = modèle en cours de chargement ;
    // pas de réponse mais process lancé = le serveur démarre encore.
    let llmState = 'down';
    if (llm === 200) llmState = 'ok';
    else if (llm !== null || llamaProcess) llmState = 'loading';

    res.json({
        hub: hub !== null ? 'ok' : 'down',
        llm: llmState,
        stt: stt !== null ? 'ok' : 'down',
        tts: tts !== null ? 'ok' : 'down'
    });
});

// --- DÉMARRAGE DU SERVEUR ---
app.listen(PORT, '127.0.0.1', async () => {
    console.log(`🚀 Serveur actif sur http://localhost:${PORT}`);

    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const cfg = JSON.parse(await fsPromises.readFile(CONFIG_FILE, 'utf8'));
            if (cfg.selectedGgufModel) {
                const ctxSize = cfg.contextSize || 4096;
                const mmproj = cfg.selectedMmprojModel || cfg.selectedMmproj || '';
                const gpuLayers = (cfg.gpuLayers !== undefined && cfg.gpuLayers !== null && cfg.gpuLayers !== '') ? cfg.gpuLayers : 99;
                console.log(`⚡ Auto-start de llama-server au lancement : ${cfg.selectedGgufModel} (Contexte: ${ctxSize}, Vision: ${mmproj || 'désactivée'}, GPU: ${gpuLayers})`);
                const ok = await startLlamaServer(cfg.selectedGgufModel, ctxSize, 8080, mmproj, gpuLayers);
                if (!ok) {
                    console.error(`❌ Le modèle configuré (${cfg.selectedGgufModel}) est introuvable dans '${GGUF_DIR}'. Maya démarre quand même, mais aucune réponse LLM ne fonctionnera tant qu'un modèle valide n'est pas sélectionné/placé dans ce dossier.`);
                }
            }
        } catch (e) {
            console.error("Erreur lors de l'auto-start de llama-server :", e);
        }
    }
});
