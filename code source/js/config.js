const config = {
    // Par défaut, llama-server écoute sur le port 8080
    endpoint: 'http://127.0.0.1:8080/v1',
    model: 'gemma-4', // Inutile pour llama-server mais requis par la structure de l'API OpenAI
    systemPrompt: 'Tu es Maya, un assistant IA utile et sympathique.'
};

export default config;