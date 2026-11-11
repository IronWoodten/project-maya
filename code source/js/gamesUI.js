import { mayaMCP } from './mcpClient.js';

// ============================================================
// 🎮 Menu « Jeux avec Maya »
// Catalogue = plugins/game/catalog/*.json via l'outil start_game (game: 'list').
// FALLBACK uniquement si le Hub est injoignable. Aucun jeu à ajouter ici à la main.
// ============================================================

const FALLBACK_GAMES = [
    {
        id: 'connect4',
        icon: 'fa-table-cells',
        title: 'Puissance 4',
        desc: 'Duel tour par tour (5-10 min). Maya joue contre toi et réagit en direct.',
        options: [
            { key: 'difficulty', label: 'Niveau de Maya', default: 'normal',
              choices: [['facile', 'Facile'], ['normal', 'Normal'], ['difficile', 'Difficile']] },
            { key: 'first_player', label: 'Premier coup', default: 'user',
              choices: [['user', 'Toi'], ['maya', 'Maya']] }
        ],
        button: 'Jouer'
    },
    {
        id: 'station',
        icon: 'fa-rocket',
        title: 'Station Nyx',
        desc: 'Campagne de science-fiction sauvegardée : Maya est la maîtresse du jeu. ' +
              'Tu joues à la voix, au chat ou avec les boutons.',
        options: [],
        button: 'Ouvrir la console'
    }
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Déballe un résultat d'outil (objet, JSON string, ou MCP { content:[{text}] }). */
function unwrap(res) {
    let r = res;
    if (r && typeof r === 'object' && Array.isArray(r.content)) {
        r = r.content.map(c => (c && c.text) ? c.text : '').join('\n');
    }
    if (typeof r === 'string') {
        const t = r.trim();
        if (!t) return r;
        try {
            const j = JSON.parse(t);
            if (j && typeof j === 'object') r = j;
        } catch (e) { /* texte simple */ }
    }
    // Certains hubs encapsulent encore dans { result: {...} }
    if (r && typeof r === 'object' && r.result && typeof r.result === 'object' && !Array.isArray(r.games)) {
        if (Array.isArray(r.result.games) || r.result.error) r = r.result;
    }
    return r;
}

function extractError(res) {
    if (res && typeof res === 'object' && Array.isArray(res.content) && res.isError) {
        return res.content.map(c => (c && c.text) ? c.text : '').join('\n') || 'Erreur du Hub';
    }
    const r = unwrap(res);
    if (r && typeof r === 'object') {
        if (r.error) return String(r.error);
        if (r.result && typeof r.result === 'object' && r.result.error) return String(r.result.error);
        return null;
    }
    if (typeof r === 'string' && /^(erreur|error)\b|impossible de lancer|indisponible/i.test(r.trim())) return r;
    return null;
}

/**
 * Normalise choices : le catalogue peut envoyer
 *   [["facile","Facile"], ...]  ou  [{value,label}, ...]
 * L'UI et le plugin attendent des paires [value, label].
 */
function normalizeChoices(choices) {
    if (!Array.isArray(choices)) return [];
    return choices.map(c => {
        if (Array.isArray(c) && c.length >= 2) return [String(c[0]), String(c[1])];
        if (c && typeof c === 'object') {
            const v = c.value ?? c.val ?? c.id ?? c[0];
            const l = c.label ?? c.name ?? c.lab ?? c[1] ?? v;
            return [String(v), String(l)];
        }
        return [String(c), String(c)];
    }).filter(([v]) => v !== 'undefined' && v !== 'null');
}

function normalizeGame(g) {
    if (!g || typeof g !== 'object') return null;
    const id = g.id || g.name;
    if (!id) return null;
    const options = (Array.isArray(g.options) ? g.options : []).map(o => ({
        key: o.key || o.id || 'opt',
        label: o.label || o.key || 'Option',
        default: o.default ?? (o.choices && o.choices[0] ? (Array.isArray(o.choices[0]) ? o.choices[0][0] : (o.choices[0].value || '')) : ''),
        choices: normalizeChoices(o.choices)
    }));
    return {
        id: String(id),
        icon: g.icon || 'fa-gamepad',
        title: g.title || g.name || String(id),
        desc: g.desc || g.description || '',
        button: g.button || 'Jouer',
        options,
        aliases: g.aliases || []
    };
}

/** Extrait la liste games depuis n'importe quelle forme de réponse Hub. */
function extractGamesList(res) {
    const r = unwrap(res);
    if (!r) return [];
    if (Array.isArray(r)) return r;
    if (Array.isArray(r.games)) return r.games;
    if (r.result && Array.isArray(r.result.games)) return r.result.games;
    if (r.data && Array.isArray(r.data.games)) return r.data.games;
    // Parfois le hub renvoie le tableau sous une autre clé
    for (const k of Object.keys(r)) {
        if (Array.isArray(r[k]) && r[k].length && r[k][0] && (r[k][0].id || r[k][0].script || r[k][0].title)) {
            return r[k];
        }
    }
    return [];
}

export function initGamesUI() {
    const modal = document.getElementById('games-modal');
    const grid = document.getElementById('games-grid');
    const statusEl = document.getElementById('games-status');
    const btnOpen = document.getElementById('btn-games');
    const btnClose = document.getElementById('btn-close-games');
    const ctxItem = document.getElementById('ctx-games');
    if (!modal || !grid) return;

    let launching = false;
    let games = FALLBACK_GAMES.map(normalizeGame).filter(Boolean);
    let startToolName = null;
    let lastCatalogError = '';

    async function getStartTool() {
        if (startToolName) return startToolName;
        if (mayaMCP && !mayaMCP.isConnected) {
            try { await mayaMCP.connect(); } catch (e) { /* vérifié juste après */ }
        }
        if (!mayaMCP || !mayaMCP.isConnected) {
            throw new Error("Le Hub de Maya n'est pas connecté (port 5005). Lance le Hub puis réessaie.");
        }
        const tools = (await mayaMCP.refreshTools()) || [];
        const tool = tools.find(t => /start_game$/i.test((t && t.name) || ''));
        if (!tool) {
            const names = tools.map(t => t.name).join(', ') || 'aucun';
            throw new Error("Outil de jeu introuvable (plugin « game » activé ?). Outils : " + names);
        }
        startToolName = tool.name;
        return startToolName;
    }

    /**
     * Charge le catalogue depuis le Hub à chaque ouverture du menu.
     * Fusionne avec le fallback : les jeux du catalogue remplacent ceux du même id.
     */
    async function loadCatalog() {
        lastCatalogError = '';
        try {
            const name = await getStartTool();
            const raw = await mayaMCP.callTool(name, { game: 'list' });
            const err = extractError(raw);
            if (err) throw new Error(err);

            const list = extractGamesList(raw)
                .map(normalizeGame)
                .filter(Boolean);

            if (list.length > 0) {
                // Catalogue Hub prioritaire ; on garde les fallback absents du catalogue
                const byId = new Map();
                FALLBACK_GAMES.map(normalizeGame).filter(Boolean).forEach(g => byId.set(g.id, g));
                list.forEach(g => byId.set(g.id, g));
                games = Array.from(byId.values());
                return { ok: true, count: list.length, total: games.length };
            }
            lastCatalogError = 'Catalogue Hub vide ou non reconnu.';
            games = FALLBACK_GAMES.map(normalizeGame).filter(Boolean);
            return { ok: false, count: 0, total: games.length };
        } catch (e) {
            lastCatalogError = (e && e.message) ? e.message : String(e);
            games = FALLBACK_GAMES.map(normalizeGame).filter(Boolean);
            return { ok: false, count: 0, total: games.length, error: lastCatalogError };
        }
    }

    function setStatus(text, cls) {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.className = 'games-status' + (cls ? ' ' + cls : '');
    }

    function render() {
        grid.innerHTML = games.map(g => {
            const opts = (g.options || []).map(o => {
                const choices = normalizeChoices(o.choices);
                const def = o.default || (choices[0] ? choices[0][0] : '');
                return `<div class="game-opt" data-key="${esc(o.key)}">` +
                    `<span class="game-opt-label">${esc(o.label)}</span>` +
                    `<div class="game-seg">` +
                    choices.map(([val, lab]) =>
                        `<button type="button" data-val="${esc(val)}" class="${val === def ? 'active' : ''}">${esc(lab)}</button>`
                    ).join('') +
                    `</div></div>`;
            }).join('');
            return `<div class="game-card" data-game="${esc(g.id)}">` +
                   `<div class="game-card-title"><i class="fa-solid ${esc(g.icon)}"></i> ${esc(g.title)}</div>` +
                   `<p class="game-card-desc">${esc(g.desc)}</p>${opts}` +
                   `<button type="button" class="game-play-btn"><i class="fa-solid fa-play"></i> ${esc(g.button)}</button>` +
                   `</div>`;
        }).join('');
    }

    async function open() {
        setStatus('Chargement du catalogue…');
        modal.classList.add('open');
        grid.innerHTML = '<div class="game-card-desc">Chargement des jeux…</div>';
        // Recharge à CHAQUE ouverture → nouveaux jeux visibles sans F5 forcé
        const result = await loadCatalog();
        render();
        if (result.ok) {
            setStatus(result.count + ' jeu(x) depuis le catalogue' +
                (result.total > result.count ? ' (+ fallback)' : '') + '.', 'ok');
        } else {
            setStatus('Catalogue Hub indisponible — liste de secours. ' +
                (lastCatalogError ? '(' + lastCatalogError + ')' : ''), 'error');
        }
    }

    function close() {
        modal.classList.remove('open');
    }

    function readOptions(card) {
        const out = {};
        card.querySelectorAll('.game-opt').forEach(opt => {
            const active = opt.querySelector('button.active');
            if (active) out[opt.dataset.key] = active.dataset.val;
        });
        return out;
    }

    async function launch(gameId, card) {
        if (launching) return;
        const game = games.find(g => g.id === gameId);
        if (!game) return;
        launching = true;
        grid.querySelectorAll('.game-play-btn').forEach(b => { b.disabled = true; });
        setStatus('Lancement de ' + game.title + '…');
        try {
            const name = await getStartTool();
            const res = await mayaMCP.callTool(name, { game: game.id, ...readOptions(card) });
            const err = extractError(res);
            if (err) throw new Error(err);
            setStatus('✅ ' + game.title + ' lancé : regarde la nouvelle fenêtre.', 'ok');
            setTimeout(close, 900);
        } catch (e) {
            setStatus('❌ ' + (e && e.message ? e.message : e), 'error');
        } finally {
            launching = false;
            grid.querySelectorAll('.game-play-btn').forEach(b => { b.disabled = false; });
        }
    }

    // Premier rendu (fallback) avant ouverture
    render();

    grid.addEventListener('click', (e) => {
        const seg = e.target.closest('.game-seg button');
        if (seg) {
            seg.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            seg.classList.add('active');
            return;
        }
        const play = e.target.closest('.game-play-btn');
        if (play) {
            const card = play.closest('.game-card');
            launch(card.dataset.game, card);
        }
    });

    if (btnOpen) btnOpen.addEventListener('click', open);
    if (btnClose) btnClose.addEventListener('click', close);
    if (ctxItem) {
        ctxItem.addEventListener('click', () => {
            const ctx = document.getElementById('vrm-context-menu');
            if (ctx) ctx.classList.remove('active');
            open();
        });
    }
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            close();
        }
    }, true);
}
