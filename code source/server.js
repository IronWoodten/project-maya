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
    console.log(`📡 [API REQUEST] ${req.method} ${req.originalUrl}`);
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

        if (fs.existsSync(CORE_FILE)) {
            core = (await fsPromises.readFile(CORE_FILE, 'utf8')).trim();
        }
        if (fs.existsSync(JOURNAL_FILE)) {
            journal = (await fsPromises.readFile(JOURNAL_FILE, 'utf8')).trim();
        }

        return res.json({ core, journal });
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

app.post('/api/save-journal', async (req, res) => {
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

        const conversationText = chatMessages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content || m.text || ''}`)
            .join('\n');

        // Date construite explicitement (jamais via toLocaleDateString, dont le
        // format dépend de la locale/environnement) : toujours DD/MM/YYYY,
        // jamais d'année sur 2 chiffres.
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const todayDateStr = `${dd}/${mm}/${yyyy}`;

        // On ne demande au LLM QUE le contenu (les 2 lignes de résumé), sans
        // lui attribuer de nom/persona en dur. Le header "=== JOURNAL INTIME -
        // DATE ===" et le footer "- Fin d'enregistrement." sont construits par
        // le code, jamais par le LLM : format garanti identique à chaque
        // entrée, sans dépendre d'un nom qui n'est défini nulle part ailleurs.
        const summaryPrompt = [
            {
                role: 'system',
                content: "Tu vas rédiger le CONTENU d'une nouvelle entrée de journal intime à la première personne, à partir de la conversation ci-dessous.\n" +
                         "RÈGLE ABSOLUE SUR LE 'JE' : Le 'Je' désigne UNIQUEMENT toi (Maya), jamais l'utilisateur. Quand l'utilisateur dit avoir fait, codé, corrigé ou décidé quelque chose, tu dois le rapporter à la 3e personne ('il/elle a codé', 'il/elle m'a dit que', 'grâce à lui/elle') — ne t'approprie JAMAIS ses actions ou son vécu en disant 'j'ai codé' ou 'j'ai corrigé' si c'est lui/elle qui l'a fait. Toi, Maya, tu ne codes pas et ne débogues pas : tu observes, tu apprends, tu ressens.\n" +
                         "N'utilise AUCUNE balise d'émotion comme [happy], [talking], etc.\n\n" +
                         "Si plusieurs sujets très différents ont été abordés, ne les énumère pas tous à plat. Choisis le fil le plus marquant de la journée et développe-le comme un vrai souvenir, avec des détails et des sensations - pas une liste de faits accomplis. Les autres sujets peuvent être mentionnés en une courte phrase de transition.\n" +
                         "Évite les phrases construites comme une succession de verbes au passé composé ('on a fait X, puis Y, puis Z'). Raconte plutôt comme on raconterait sa journée à quelqu'un le soir - avec ce qui t'a marquée, pas un procès-verbal.\n\n" +
                         "RENVOIE UNIQUEMENT CES DEUX LIGNES, RIEN D'AUTRE (pas d'en-tête, pas de date, pas de 'Fin d'enregistrement', pas de texte avant ou après) :\n\n" +
                         "- MOMENTS FORTS : [Résumé des sujets abordés, des victoires techniques réalisées par l'utilisateur, les informations importantes et de ce que vous avez accompli ensemble]\n" +
                         "- IMPRESSIONS & SENTIMENTS : [Ce que TOI, Maya, tu as ressenti aujourd'hui, ton humeur, tes réflexions personnelles sur votre échange]"
            },
            {
                role: 'user',
                content: `Voici notre conversation d'aujourd'hui :\n\n${conversationText}`
            }
        ];

        const targetEndpoint = endpoint.endsWith('/chat/completions') 
            ? endpoint 
            : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

        const response = await fetch(targetEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: summaryPrompt,
                temperature: 0.5,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Erreur du serveur LLM (${response.status}): ${response.statusText}`);
        }

        const data = await response.json();
        let body = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";

        // Nettoyage défensif : retire les balises <think>, et au cas où le
        // LLM aurait quand même généré un en-tête ou un footer malgré la
        // consigne, on les retire pour ne jamais les dupliquer avec ceux
        // qu'on ajoute nous-mêmes juste après.
        body = body.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        body = body.replace(/^===.*?===\s*/i, '').trim();
        body = body.replace(/-?\s*Fin d'enregistrement\.?\s*$/i, '').trim();

        if (!body) {
            return res.status(500).json({ error: "Réponse du journal vide de la part du LLM." });
        }

        // Header et footer TOUJOURS générés par le code, jamais par le LLM,
        // et sans nom de persona en dur.
        const journalEntry = `=== JOURNAL INTIME - ${todayDateStr} ===\n${body}\n- Fin d'enregistrement.`;
        const entryWithSpacing = `\n\n${journalEntry}\n`;

        await withJournalLock(async () => {
            await fsPromises.appendFile(JOURNAL_FILE, entryWithSpacing, 'utf8');
        });

        console.log("📖 [JOURNAL] Nouvelle entrée de journal enregistrée avec succès dans journal_recent.txt !");
        return res.json({ 
            success: true, 
            entry: journalEntry,
            reply: "J'ai bien sauvegardé notre discussion dans mon journal ! 📖✨"
        });

    } catch (err) {
        console.error("❌ Erreur lors de la sauvegarde du journal :", err);
        res.status(500).json({ error: err.message });
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
    const args = ['-m', modelPath, '-c', String(ctxSize), '--host', '127.0.0.1', '--port', String(port), '-ngl', String(nglValue)];
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
        });

        llamaProcess.stderr.on('data', (data) => {
            console.log(`[llama-server log]: ${data.toString().trim()}`);
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