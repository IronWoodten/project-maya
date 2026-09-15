/**
 * Gestion de l'historique des chats via des fichiers JSON sur le serveur.
 *
 * 1 conversation = 1 fichier :
 * data/chats/chat_xxxxx.json
 */

const ACTIVE_CHAT_KEY = 'maya_active_chat_id';

let currentChatData = null;


/**
 * Convertit systématiquement le contenu d'un message en chaîne de texte pure
 * (évite que les tableaux/objets d'images ne fassent planter le journal).
 */
function toPureText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const textObj = content.find(i => i && i.type === 'text');
        if (textObj && textObj.text) return textObj.text;
        return content.map(i => (typeof i === 'string' ? i : i?.text || '')).join(' ').trim();
    }
    if (content && typeof content === 'object') {
        return content.text || content.caption || JSON.stringify(content);
    }
    return String(content || '');
}


/**
 * Retourne l'ID de la conversation active.
 * Si aucune conversation n'est définie, un nouvel ID est créé localement.
 */
export function getCurrentChatId() {
    let id = localStorage.getItem(ACTIVE_CHAT_KEY);

    if (!id) {
        id = 'chat_' + Date.now();
        localStorage.setItem(ACTIVE_CHAT_KEY, id);
    }

    return id;
}


/**
 * Retourne la conversation actuellement chargée en mémoire.
 */
export function getCurrentChat() {
    if (!currentChatData) {
        const id = getCurrentChatId();

        currentChatData = {
            id: id,
            title: 'Nouvelle discussion',
            timestamp: Date.now(),
            messages: []
        };
    }

    return currentChatData;
}


/**
 * Retourne les messages de la conversation active avec un texte 100 % propre.
 */
export function getCurrentChatMessages() {
    const chat = getCurrentChat();

    if (!chat || !Array.isArray(chat.messages)) {
        return [];
    }

    return chat.messages.map(msg => ({
        ...msg,
        content: toPureText(msg.content)
    }));
}


/**
 * Crée une nouvelle conversation.
 */
export async function createNewChat() {
    const newId = 'chat_' + Date.now();

    localStorage.setItem(ACTIVE_CHAT_KEY, newId);

    currentChatData = {
        id: newId,
        title: 'Nouvelle discussion',
        timestamp: Date.now(),
        messages: []
    };

    try {
        const res = await fetch('/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentChatData)
        });

        if (!res.ok) {
            console.error(
                'Erreur création du nouveau chat :',
                res.status,
                res.statusText
            );
        }
    } catch (err) {
        console.error(
            'Erreur création du nouveau chat sur le serveur :',
            err
        );
    }

    return newId;
}


/**
 * Récupère tous les chats enregistrés sur le serveur.
 */
export async function getAllChats() {
    try {
        const res = await fetch('/api/chats');

        if (!res.ok) {
            console.error(
                'Erreur récupération des chats :',
                res.status,
                res.statusText
            );

            return [];
        }

        return await res.json();

    } catch (err) {
        console.error(
            'Erreur récupération de la liste des chats :',
            err
        );

        return [];
    }
}


/**
 * Sauvegarde un message dans la conversation active.
 */
export async function saveMessageToCurrentChat(role, content) {
    const chat = getCurrentChat();

    if (!chat.messages) {
        chat.messages = [];
    }

    const textContent = toPureText(content);

    // Le premier message devient le titre de la conversation.
    if (chat.messages.length === 0 && role === 'user') {
        chat.title =
            textContent.substring(0, 30) +
            (textContent.length > 30 ? '...' : '');
    }

    chat.messages.push({
        role: role,
        content: textContent,
        timestamp: Date.now()
    });

    chat.timestamp = Date.now();

    try {
        const res = await fetch('/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(chat)
        });

        if (!res.ok) {
            throw new Error(
                'HTTP ' + res.status + ' ' + res.statusText
            );
        }

        const result = await res.json();

        if (result && result.chat) {
            currentChatData = result.chat;
        }

        console.log(
            '💾 Chat sauvegardé : ' + chat.id + '.json'
        );

        return result;

    } catch (err) {
        console.error(
            'Erreur sauvegarde du chat sur le serveur :',
            err
        );

        throw err;
    }
}


/**
 * Charge une conversation spécifique depuis son fichier JSON.
 */
export async function loadChat(chatId) {
    localStorage.setItem(ACTIVE_CHAT_KEY, chatId);

    try {
        const res = await fetch('/api/chats/' + chatId);

        if (res.ok) {
            currentChatData = await res.json();
        } else {
            console.warn(
                'Chat ' + chatId + ' introuvable sur le serveur.'
            );

            if (!currentChatData || currentChatData.id !== chatId) {
                currentChatData = {
                    id: chatId,
                    title: 'Nouvelle discussion',
                    timestamp: Date.now(),
                    messages: []
                };
            }
        }

    } catch (err) {
        console.error(
            'Erreur chargement du chat ' + chatId + ' :',
            err
        );

        if (!currentChatData || currentChatData.id !== chatId) {
            currentChatData = {
                id: chatId,
                title: 'Nouvelle discussion',
                timestamp: Date.now(),
                messages: []
            };
        }
    }

    return currentChatData;
}


/**
 * Change de conversation.
 */
export async function switchChat(chatId) {
    return await loadChat(chatId);
}


/**
 * Supprime une conversation.
 */
export async function deleteChat(chatId) {
    try {
        const res = await fetch('/api/chats/' + chatId, {
            method: 'DELETE'
        });

        if (!res.ok) {
            console.error(
                'Erreur suppression du chat ' + chatId + ':',
                res.status,
                res.statusText
            );
        }

    } catch (err) {
        console.error(
            'Erreur lors de la suppression du chat ' + chatId + ' :',
            err
        );
    }

    if (getCurrentChatId() === chatId) {
        const newId = 'chat_' + Date.now();

        localStorage.setItem(ACTIVE_CHAT_KEY, newId);

        currentChatData = {
            id: newId,
            title: 'Nouvelle discussion',
            timestamp: Date.now(),
            messages: []
        };
    }
}


// --- ALIAS POUR COMPATIBILITÉ AVEC HISTORYUI.JS ---

export const getHistory = getAllChats;
export const getChats = getAllChats;
export const deleteHistory = deleteChat;
export const newChat = createNewChat;
export const saveChat = saveMessageToCurrentChat;

// Initialisation au chargement de la page (Règles Bug 1 sur F5)
loadChat(getCurrentChatId());