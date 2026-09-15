import json
import os
from datetime import datetime
import logging

logger = logging.getLogger("MayaAutonomy")

class HistoryManager:
    def __init__(self, file_path: str):
        self.file_path = file_path

    def add(self, goal_name: str, result: str = "Terminé"):
        """Enregistre une trace locale synchrone et rapide."""
        self.add_entry(goal_name, goal_name, result)

    def add_entry(self, goal_id: str, goal_name: str = "", result: str = "Terminé"):
        """Méthode compatible avec le Scheduler et l'Executor."""
        name = goal_name if goal_name else goal_id
        try:
            os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
            history = self.load()
            
            history.append({
                "timestamp": datetime.now().isoformat(),
                "goal_id": goal_id,
                "goal": name,
                "result": result
            })
            
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=4, ensure_ascii=False)
            
            logger.info(f"📝 [HistoryManager] Sauvegardé en local : {name}")
        except Exception as e:
            logger.error(f"❌ [HistoryManager] Erreur écriture locale : {e}")

    def load(self) -> list:
        """Charge l'historique local."""
        if not os.path.exists(self.file_path):
            return []
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def get_history(self) -> list:
        return self.load()

    def get_entries(self) -> list:
        return self.load()