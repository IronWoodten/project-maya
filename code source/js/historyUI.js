// js/historyUI.js

import { 
    getHistory, 
    getCurrentChatId, 
    getCurrentChat,
    createNewChat, 
    switchChat, 
    deleteChat 
} from './chatHistory.js';

let onLoadChatCallback = null;
let onClearCallback = null;

/**
 * Initialise l'interface utilisateur de l'historique
 * @param {Function} onLoadChat - Callback appelée lorsqu'une conversation est chargée
 * @param {Function} onClear - Callback appelée pour vider le chat (ex: nouvelle discussion)
 */
export function initHistoryUI(onLoadChat, onClear) {
    onLoadChatCallback = onLoadChat;
    onClearCallback = onClear;

    // 1. Bouton "Nouvelle discussion"
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        // Duplication pour nettoyer d'anciens écouteurs potentiels
        const cleanBtn = newChatBtn.cloneNode(true);
        newChatBtn.parentNode.replaceChild(cleanBtn, newChatBtn);

        cleanBtn.addEventListener('click', async () => {
            await createNewChat();
            if (onClearCallback) onClearCallback();
            await renderHistoryList();

            closeHistoryDrawer();

            const userInput = document.getElementById('user-input');
            if (userInput) userInput.focus();
        });
    }

    // 2. Bouton d'ouverture de l'historique (#btn-history)
    const btnHistory = document.getElementById('btn-history');
    if (btnHistory) {
        btnHistory.addEventListener('click', () => {
            renderHistoryList();
        });
    }

    // Premier rendu au chargement
    renderHistoryList();
}

/**
 * Génère et affiche la liste des conversations dans le tiroir
 */
export async function renderHistoryList() {
    const listContainer = document.getElementById('history-list');
    if (!listContainer) return;

    // Prise en charge synchrone ou asynchrone (Promises)
    const historyData = await getHistory();
    const currentId = await getCurrentChatId();

    listContainer.innerHTML = '';

    const chats = Object.values(historyData || {}).sort((a, b) => {
        const timeA = a.updatedAt || a.timestamp || a.createdAt || 0;
        const timeB = b.updatedAt || b.timestamp || b.createdAt || 0;
        return timeB - timeA;
    });

    if (chats.length === 0) {
        listContainer.innerHTML = '<div style="padding: 12px; color: #888; text-align: center; font-size: 0.85rem;">Aucun historique</div>';
        return;
    }

    chats.forEach(chat => {
        const item = document.createElement('div');
        const isActive = chat.id === currentId;
        item.className = `history-item ${isActive ? 'active' : ''}`;

        item.innerHTML = `
            <span title="${escapeAttr(chat.title || 'Discussion')}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 190px; font-size: 0.88rem;">
                <i class="fa-regular fa-message" style="margin-right: 6px; opacity: 0.7;"></i>
                ${escapeHTML(chat.title || 'Discussion')}
            </span>
            <button class="delete-chat-btn" title="Supprimer">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        // Sélection d'une discussion
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.delete-chat-btn')) return;

            await switchChat(chat.id);
            await renderHistoryList();

            if (onLoadChatCallback) {
                const activeChat = (await getCurrentChat()) || chat;
                onLoadChatCallback(activeChat);
            }

            closeHistoryDrawer();
        });

        // Suppression d'une discussion
        const delBtn = item.querySelector('.delete-chat-btn');
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (!confirm(`Voulez-vous vraiment supprimer "${chat.title || 'cette conversation'}" ?`)) {
                return;
            }

            await deleteChat(chat.id);

            if (chat.id === currentId && onClearCallback) {
                onClearCallback();
            }

            await renderHistoryList();
        });

        listContainer.appendChild(item);
    });
}

/**
 * Ferme le tiroir d'historique et l'overlay s'ils existent
 */
function closeHistoryDrawer() {
    document.getElementById('history-drawer')?.classList.remove('open');
    document.getElementById('history-overlay')?.classList.remove('active');
}

// Utilitaires de sécurité
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}