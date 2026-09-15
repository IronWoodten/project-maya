import aiohttp
import json
import logging

logger = logging.getLogger("MayaAutonomy")

class HubClient:
    def __init__(self, base_url: str = "http://localhost:5000"):
        # On s'assure que l'URL est propre (le port 5000 de ton main.py)
        self.base_url = base_url.rstrip("/")

    async def get_tools(self) -> list:
        """Récupère la liste des outils MCP en testant les deux routes possibles."""
        paths_to_try = ["/api/tools", "/tools"] 
        
        for path in paths_to_try:
            url = f"{self.base_url}{path}"
            logger.info(f"[HubClient] Tentative de récupération des outils sur : {url}")
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            logger.info(f"[HubClient] ✅ Succès sur {url}")
                            if isinstance(data, dict) and "tools" in data:
                                return data["tools"]
                            return data if isinstance(data, list) else []
                        else:
                            logger.warning(f"[HubClient] ❌ {url} a renvoyé Status {response.status}")
            except Exception as e:
                logger.error(f"[HubClient] Erreur de connexion sur {url}: {e}")

        logger.error("[HubClient] 💀 ÉCHEC TOTAL : Aucune route /tools trouvée !")
        return []

    async def execute_tool(self, tool_name: str, arguments: dict) -> dict:
        """
        Exécute un outil en convertissant le format LLM vers le format du Hub.
        Format attendu par ton API : {"plugin": "...", "action": "...", "params": {...}}
        """
        # --- LA MAGIE DE LA CONVERSION ---
        if "." in tool_name:
            plugin_id, action = tool_name.split(".", 1)
        else:
            plugin_id = "default"
            action = tool_name

        payload = {
            "plugin": plugin_id,
            "action": action,
            "params": arguments
        }

        # On teste les deux chemins possibles pour l'exécution
        paths_to_try = ["/api/execute", "/execute"]
        
        for path in paths_to_try:
            url = f"{self.base_url}{path}"
            logger.info(f"[HubClient] 🚀 TENTATIVE D'EXÉCUTION -> {url} | Payload: {json.dumps(payload)}")

            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload) as response:
                        if response.status == 200:
                            logger.info(f"[HubClient] ✅ SUCCÈS sur {url}")
                            result_json = await response.json()
                            # Ton API renvoie {"status": "success", "result": ...}
                            if result_json.get("status") == "success":
                                return result_json.get("result", {})
                            else:
                                return {"error": result_json.get("message", "Unknown error")}
                        else:
                            error_body = await response.text()
                            logger.warning(f"[HubClient] ⚠️ {url} a renvoyé Status {response.status}. Erreur: {error_body}")
            
            except Exception as e:
                logger.error(f"[HubClient] Erreur réseau sur {url}: {e}")

        logger.error("[HubClient] 💀 ÉCHEC TOTAL : Toutes les routes d'exécution ont échoué.")
        return {"error": "All execution paths failed."}
