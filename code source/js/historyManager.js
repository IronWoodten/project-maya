/**
 * Gestion de l'historique des chats dans localStorage
 */

const STORAGE_KEY = 'maya_chat_history';
const ACTIVE_CHAT_KEY = 'maya_active_chat_id';

export function getAllChats() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

export function getCurrentChatId() {
    let id = localStorage.getItem(ACTIVE_CHAT_KEY);
    if (!id) {
        id = 'chat_' + Date.now();
        localStorage.setItem(ACTIVE_CHAT_KEY, id);
    }
    return id;
}

export function createNewChat() {
    const newId = 'chat_' + Date.now();
    localStorage.setItem(ACTIVE_CHAT_KEY, newId);
    return newId;
}

export function saveMessageToHistory(role, content) {
    const chatId = getCurrentChatId();
    const chats = getAllChats();

    if (!chats[chatId]) {
        chats[chatId] = {
            id: chatId,
            title: content.substring(0, 30) + '...',
            timestamp: Date.now(),
            messages: []
        };
    }

    chats[chatId].messages.push({ role, content, timestamp: Date.now() });
    chats[chatId].timestamp = Date.now();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    renderHistoryListUI();
}

export function loadChatMessages(chatId) {
    localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
    const chats = getAllChats();
    return chats[chatId] ? chats[chatId].messages : [];
}

export function deleteChat(chatId) {
    const chats = getAllChats();
    delete chats[chatId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    if (localStorage.getItem(ACTIVE_CHAT_KEY) === chatId) {
        createNewChat();
    }
    renderHistoryListUI();
}

/**
 * Met à jour le menu latéral de l'historique dans le HTML
 */
export function renderHistoryListUI() {
    const listContainer = document.getElementById('history-list');
    if (!listContainer) return;

    const chats = getAllChats();
    const currentId = getCurrentChatId();
    
    listContainer.innerHTML = '';

    const sortedChats = Object.values(chats).sort((a, b) => b.timestamp - a.timestamp);

    if (sortedChats.length === 0) {
        listContainer.innerHTML = '<div style="padding: 10px; color: #888; text-align: center;">Aucun historique</div>';
        return;
    }

    sortedChats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `history-item ${chat.id === currentId ? 'active' : ''}`;
        item.style.cssText = `
            padding: 10px;
            margin-bottom: 6px;
            background: ${chat.id === currentId ? '#313244' : '#181825'};
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        item.innerHTML = `
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; font-size: 0.88rem;">
                ${chat.title || 'Discussion'}
            </span>
            <button class="delete-chat-btn" style="background: none; border: none; color: #f38ba8; cursor: pointer;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        // Charger la discussion au clic
        item.addEventListener('click', (e) => {
            if (e.target.closest('.delete-chat-btn')) return;
            
            const messages = loadChatMessages(chat.id);
            const chatBody = document.getElementById('chat-body');
            if (chatBody) {
                chatBody.innerHTML = '';
                messages.forEach(msg => {
                    const div = document.createElement('div');
                    div.className = msg.role === 'user' ? 'user' : 'bot';
                    div.textContent = msg.content;
                    chatBody.appendChild(div);
                });
                chatBody.scrollTop = chatBody.scrollHeight;
            }

            document.getElementById('history-drawer')?.classList.remove('open');
            document.getElementById('history-overlay')?.classList.remove('active');
            renderHistoryListUI();
        });

        // Supprimer la discussion
        const delBtn = item.querySelector('.delete-chat-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
            if (chat.id === currentId) {
                document.getElementById('chat-body').innerHTML = '';
            }
        });

        listContainer.appendChild(item);
    });
}