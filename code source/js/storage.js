function getHistoryMessages() {
    const history = [];
    const messages = document.querySelectorAll('.message');
    
    for (let i = messages.length - 1; i >= 0 && history.length < 20; i--) {
        const message = messages[i];
        const isUser = message.classList.contains('user');
        
        // On nettoie pour enlever le "U:" ou "M:" du début
        let content = message.textContent.replace(/^(U|M):\s*/, '').trim();

        // ⚠️ CRUCIAL : On IGNORE le message temporaire de chargement "..."
        if (content === '...' || content === '') {
            continue;
        }

        if (isUser) {
            history.unshift({ role: 'user', content: content });
        } else {
            history.unshift({ role: 'assistant', content: content });
        }
    }
    
    return history;
}

export { getHistoryMessages };