import os
import requests
import threading
from core.base_plugin import BasePlugin
from core.logger import setup_logger
from core.config_manager import ConfigManager

logger = setup_logger("ResearchPlugin")

STOPWORDS = {
    "dernières", "dernière", "nouvelles", "nouvelle", "mission", 
    "2026", "2025", "actu", "actuel", "recherche", "infos", 
    "information", "aujourd'hui", "game", "gameplay", "details"
}

class ResearchPlugin(BasePlugin):
    id = "research"
    name = "Web Research"
    description = "Recherche web avec vérification préalable et sauvegarde automatique en mémoire."

    capabilities = ["search_web"]

    # Prise en charge du format JSON Schema valide pour la détection d'outils (Tool Calling / Function Calling)
    tools = {
        "search_web": {
            "description": "Recherche une information sur le web et génère une synthèse.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Question ou sujet précis à rechercher sur le web."
                    }
                },
                "required": ["query"]
            }
        }
    }

    def __init__(self, hub=None):
        self.hub = hub
        cm = ConfigManager()
        cm.load_config()
        self.api_key = cm.get("tavily_api_key", "")

    def execute_action(self, action_name: str, params: any = None) -> any:
        """Alias direct pour la compatibilité PluginManager."""
        return self.run(action_name, params)

    def run(self, action: str, params: any) -> any:
        # Interception flexible des noms d'action (ex: 'search_web', 'research_search_web', 'research.search_web')
        if "search" in action or "web" in action:
            query = ""

            # 1. Si params est directement une chaîne de caractères
            if isinstance(params, str):
                query = params
            # 2. Si params est un dictionnaire
            elif isinstance(params, dict):
                query = (
                    params.get("query") 
                    or params.get("kwargs") 
                    or params.get("title") 
                    or params.get("search_query")
                    or ""
                )

                # Cas où les paramètres sont imbriqués dans additionalProperties
                if not query and "additionalProperties" in params:
                    add_props = params["additionalProperties"]
                    if isinstance(add_props, dict):
                        query = add_props.get("title") or add_props.get("query") or ""
                    elif isinstance(add_props, str):
                        query = add_props

            query = str(query).strip()

            if not query:
                logger.warning(f"⚠️ Action '{action}' appelée avec une requête vide. Params reçus: {params}")
                return {"error": "Erreur : Requête vide ou invalide."}

            return self.deep_search(query)

        return f"Action '{action}' inconnue pour ResearchPlugin."

    def _get_memories(self, query: str):
        """Recherche les souvenirs pertinents en passant par le Hub."""
        if self.hub:
            try:
                return self.hub.execute_action(
                    "memory", 
                    "query_memory", 
                    {"keyword": query}
                )
            except Exception as e:
                logger.error(f"Erreur lors de la récupération mémoire : {e}")
                return []
        return []

    def _save_to_memory(self, memory_data: dict):
        """Enregistre en mémoire via le Hub."""
        if self.hub:
            try:
                return self.hub.execute_action("memory", "save_memory", memory_data)
            except Exception as e:
                logger.error(f"Erreur lors de la sauvegarde mémoire : {e}")
                return None
        return "Erreur : Pas de Hub disponible pour la sauvegarde."

    def deep_search(self, query: str):
        logger.info(f"🔍 Début de la recherche profonde pour : '{query}'")

        # 1. VÉRIFICATION STRICTE EN MÉMOIRE (CACHE HIT)
        existing_memories = self._get_memories(query)
        
        important_words = [
            w.lower() for w in query.split() 
            if len(w) > 3 and w.lower() not in STOPWORDS
        ]
        
        if existing_memories and important_words:
            for mem in existing_memories:
                content = mem.get("content", "").lower()
                matches = sum(1 for word in important_words if word in content)
                
                # Tolérance : match parfait ou au moins 80% des mots importants trouvés
                if matches >= len(important_words):
                    logger.info("✨ Information exacte trouvée en mémoire !")
                    return {
                        "query": query,
                        "summary": f"[Mémoire de Maya] {mem.get('content')}",
                        "sources": mem.get("source", []),
                        "from_cache": True,
                        "confidence": mem.get("confidence", 1.0)
                    }

        # 2. RECHERCHE WEB VIA TAVILY (SYNTHÈSE DIRECTE PAR L'API)
        logger.info("🔎 Recherche Web lancée via Tavily...")
        if not self.api_key or "COLLE_TA_CLE_ICI" in self.api_key:
            return {"error": "Clé API Tavily manquante dans config.json."}

        payload = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": "basic",
            "include_answer": True,  # Tavily rédige la réponse directement
            "max_results": 5
        }

        try:
            response = requests.post("https://api.tavily.com/search", json=payload, timeout=15)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            logger.error(f"Erreur Tavily : {e}")
            return {"error": f"Échec de la recherche web : {str(e)}"}

        results = data.get("results", [])
        urls = [r.get("url", "") for r in results if r.get("url")]
        
        # Récupération de la synthèse native de Tavily
        summary = data.get("answer", "").strip()

        # Secours si Tavily ne retourne pas d'answer directe
        if not summary and results:
            snippets = [r.get("content", "") for r in results[:2] if r.get("content")]
            summary = " ".join(snippets)[:350] + "..."

        if not summary:
            summary = "Aucun résultat trouvé sur le web."

        # 3. SAUVEGARDE AUTOMATIQUE ASYNCHRONE EN MÉMOIRE
        logger.info("💾 Lancement de la sauvegarde mémoire en arrière-plan...")
        def async_save():
            try:
                self._save_to_memory({
                    "content": summary,
                    "importance": 4,
                    "tags": ["web_research"] + important_words,
                    "type": "research",
                    "source": urls,
                    "confidence": 0.85
                })
            except Exception as e:
                logger.error(f"Erreur sauvegarde mémoire async : {e}")

        threading.Thread(target=async_save, daemon=True).start()

        return {
            "query": query,
            "summary": summary,
            "sources": urls,
            "from_cache": False,
            "confidence": 0.85
        }

def get_instance(hub=None):
    return ResearchPlugin(hub=hub)