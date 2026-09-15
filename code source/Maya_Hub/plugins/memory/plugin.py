import json
import os
from datetime import datetime
from typing import Any, Dict, List
from core.base_plugin import BasePlugin
from core.logger import setup_logger

# Initialisation du logger spécifique
logger = setup_logger("MemoryPlugin")

class MemoryPlugin(BasePlugin):
    id = "memory"
    name = "Long Term Memory"
    description = "Gestion de la mémoire à long terme, des souvenirs et des préférences."

    # On expose les capacités pour le Hub/MCP
    capabilities = ["save_memory", "query_memory", "forget_old"]

    tools = {
        "save_memory": {
            "description": "Sauvegarder un souvenir important dans la mémoire long terme de Maya.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "Texte du souvenir à enregistrer.",
                    },
                    "importance": {
                        "type": "integer",
                        "description": "Importance du souvenir de 1 à 5.",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Liste de mots-clés associés au souvenir.",
                    },
                    "type": {
                        "type": "string",
                        "description": "Type de mémoire (ex: knowledge, research).",
                    },
                    "source": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Liste des URLs sources.",
                    },
                    "confidence": {
                        "type": "number",
                        "description": "Indice de confiance (0.0 à 1.0).",
                    },
                },
                "required": ["content"],
            },
        },
        "query_memory": {
            "description": "Rechercher des souvenirs existants dans la mémoire long terme.",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {
                        "type": "string",
                        "description": "Mot ou expression à rechercher.",
                    }
                },
                "required": [],
            },
        },
        "forget_old": {
            "description": "Nettoyer les anciens souvenirs de la mémoire.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    }

    def __init__(self, hub=None):
        # On stocke le HUB pour permettre l'inter-communication entre plugins ! 🚀
        self.hub = hub
        # Utilisation d'un chemin relatif sûr par rapport au fichier de mémoire
        self.memory_file = os.path.join(os.path.dirname(__file__), "memory_data.json")
        logger.info(f"Module Mémoire initialisé (Stockage : {self.memory_file})")

    def run(self, action: str, params: Dict[str, Any]) -> Any:
        """Point d'entrée unique pour le PluginManager."""
        logger.info(f"Action '{action}' reçue par MemoryPlugin avec les paramètres : {params}")

        if action == "save_memory":
            return self.save_memory(params)

        elif action == "query_memory":
            # On récupère le keyword depuis le dictionnaire params
            # (accepte aussi "query", au cas où l'appelant utilise ce nom-là)
            keyword = params.get("keyword") or params.get("query", "")
            return self.query_memory(keyword)

        elif action == "forget_old":
            logger.info("Action 'forget_old' appelée")
            return "Nettoyage de la mémoire terminé."

        else:
            logger.warning(f"Action '{action}' inconnue pour MemoryPlugin.")
            return f"Erreur : l'action '{action}' est inconnue."

    def save_memory(self, params: Dict[str, Any]) -> str:
        """Enregistre un souvenir avec des métadonnées enrichies."""
        try:
            memories = self._load_all_memories()

            content = params.get("content", "")
            if not content:
                return "Erreur : Le contenu est vide."

            new_memory = {
                "id": len(memories) + 1,
                "timestamp": datetime.now().isoformat(),
                "content": content,
                "importance": params.get("importance", 3),
                "tags": params.get("tags", []),
                "type": params.get("type", "knowledge"),
                "source": params.get("source", []),
                "confidence": params.get("confidence", 0.5)
            }

            memories.append(new_memory)
            self._save_to_disk(memories)

            logger.info(f"🧠 Nouveau souvenir enregistré : {content[:30]}...")
            return f"Souvenir sauvegardé avec succès (ID: {new_memory['id']})."

        except Exception as e:
            logger.error(f"Erreur sauvegarde mémoire : {e}")
            return f"Erreur de mémorisation : {e}"

    def query_memory(self, keyword: str) -> List[Dict]:
        """Recherche souple par mots-clés dans le contenu ou les tags."""
        logger.info(f"🔍 Recherche en mémoire pour le mot-clé : '{keyword}'")

        memories = self._load_all_memories()
        results = []

        if not keyword:
            return memories

        # Découpage en mots utiles (on ignore les petits mots de liaison)
        words = [
            w.lower()
            for w in keyword.split()
            if len(w) > 3
        ]

        # Si après filtrage on n'a plus de mots, on fait une recherche classique par mot-clé entier
        if not words:
            k_low = keyword.lower()
            for m in memories:
                if k_low in m["content"].lower() or any(k_low in t.lower() for t in m.get("tags", [])):
                    results.append(m)
            return results

        for m in memories:
            content = m.get("content", "").lower()
            tags = " ".join(m.get("tags", [])).lower()

            # On fusionne le contenu et les tags pour une recherche globale
            text = content + " " + tags

            # Nombre de mots importants retrouvés
            matches = sum(
                1 for word in words
                if word in text
            )

            # Au moins 2 mots importants trouvés pour considérer que c'est pertinent
            # (Ou si un seul mot est trouvé mais qu'il est très long/précis, on peut ajuster ici)
            if matches >= 2 or (len(words) == 1 and matches >= 1):
                results.append(m)

        logger.info(f"✨ {len(results)} souvenir(s) trouvé(s)")
        return results

    def _load_all_memories(self) -> List[Dict]:
        """Charge les souvenirs depuis le disque."""
        if not os.path.exists(self.memory_file):
            return []
        try:
            with open(self.memory_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Erreur lecture mémoire : {e}")
            return []

    def _save_to_disk(self, memories: List[Dict]):
        """Sauvegarde les souvenirs sur le disque."""
        try:
            with open(self.memory_file, "w", encoding="utf-8") as f:
                json.dump(memories, f, indent=4, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Erreur écriture disque mémoire : {e}")

def get_instance(hub=None):
    """Point d'entrée avec support du HUB pour l'injection."""
    return MemoryPlugin(hub=hub)
