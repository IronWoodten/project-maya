/**
 * Client MCP (Model Context Protocol) pour Maya Hub
 */
export class MayaMCPClient {
    constructor() {
        this.hubUrl = '/api/mcp';
        this.isConnected = false;
        this.availableTools = [];
        this.isChecking = false;
    }

    /**
     * Tente de connecter et d'initialiser le client MCP.
     * Réessaie automatiquement en cas d'échec (le sous-process Python MCP peut
     * mettre du temps à démarrer, notamment au tout premier lancement pendant
     * que le support GPU se télécharge en arrière-plan) plutôt que d'abandonner
     * définitivement pour le reste de la session après un seul essai raté.
     */
    async connect(retriesLeft = 5) {
        if (this.isChecking) return this.isConnected;
        this.isChecking = true;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 sec timeout

            // 1. Initialisation JSON-RPC — VRAIE requête, elle DOIT avoir un id
            // (server.js rejette avec 400 tout body sans id, et s'en sert pour
            // faire correspondre la réponse de Python à cette requête HTTP).
            const initRes = await fetch(this.hubUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method: "initialize",
                    params: { 
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: { name: "Maya-Studio", version: "1.0.0" } 
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!initRes.ok) {
                console.warn(`⚠️ Hub MCP répond avec le statut HTTP : ${initRes.status}`);
                this.isConnected = false;
                this.isChecking = false;
                return await this._retryOrGiveUp(retriesLeft);
            }

            // Notification d'initialisation (standard MCP) — SEULE exception :
            // une vraie notification JSON-RPC n'a JAMAIS d'id. La librairie mcp
            // côté Python ne sait pas la parser correctement de toute façon,
            // donc on l'envoie "best effort" et on ignore le résultat (.catch).
            await fetch(this.hubUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notifications/initialized",
                    params: {}
                })
            }).catch(() => {});

            // 2. Récupération des outils pour valider la connexion
            const tools = await this.refreshTools();

            if (Array.isArray(tools) && tools.length > 0) {
                this.isConnected = true;
                console.log(`✅ Connecté au Hub Maya : ${tools.length} outils disponibles.`);
            } else {
                // Si la liste est vide mais que le serveur a répondu, on vérifie si res était ok
                this.isConnected = initRes.ok;
            }
        } catch (error) {
            console.warn(`⚠️ Hub Maya non accessible :`, error.message);
            this.isConnected = false;
            this.isChecking = false;
            return await this._retryOrGiveUp(retriesLeft);
        } finally {
            this.isChecking = false;
        }

        return this.isConnected;
    }

    /**
     * Réessaie la connexion après un court délai, tant qu'il reste des tentatives.
     */
    async _retryOrGiveUp(retriesLeft) {
        if (retriesLeft <= 0) {
            console.warn("⚠️ Hub MCP toujours inaccessible après plusieurs tentatives, abandon.");
            return false;
        }
        console.log(`🔄 Nouvelle tentative de connexion au Hub MCP dans 3s... (${retriesLeft} restantes)`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return await this.connect(retriesLeft - 1);
    }

    /**
     * Rafraîchit la liste des outils disponibles
     */
    async refreshTools() {
        try {
            const res = await fetch(this.hubUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method: "tools/list", 
                    params: {} 
                })
            });

            if (!res.ok) {
                this.isConnected = false;
                return [];
            }

            const data = await res.json();
            const tools = data?.result?.tools || data?.tools || [];

            if (Array.isArray(tools)) {
                this.availableTools = tools;
                this.isConnected = true;
                return this.availableTools;
            } else {
                this.isConnected = false;
                return [];
            }
        } catch (e) {
            console.error("❌ Erreur lors de la récupération des outils :", e);
            this.isConnected = false;
            return [];
        }
    }

    /**
     * Appelle un outil FastMCP
     */
    async callTool(name, args = {}) {
        try {
            const res = await fetch(this.hubUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method: "tools/call",
                    params: { name, arguments: args }
                })
            });
            const data = await res.json();
            return data.result || data;
        } catch (err) {
            console.error(`Erreur lors de l'appel de l'outil ${name}:`, err);
            return { error: err.message };
        }
    }
}

export const mayaMCP = new MayaMCPClient();
