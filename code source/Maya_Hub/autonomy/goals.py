import json
import os
from datetime import datetime

class GoalManager:
    def __init__(self, file_path: str):
        self.file_path = file_path

    def load(self) -> dict:
        """
        Charge le fichier et garantit TOUJOURS le retour d'un DICTIONNAIRE 
        contenant la clé 'goals'. Si le fichier est une liste, on la convertit.
        """
        if not os.path.exists(self.file_path):
            return {"goals": []}
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            if isinstance(data, list):
                return {"goals": data}
            
            if isinstance(data, dict):
                return data
            
            return {"goals": []}
        except (json.JSONDecodeError, IOError):
            return {"goals": []}

    def get_goals(self) -> list:
        """
        Retourne la liste des objectifs (texte brut ou dictionnaire).
        Ne modifie JAMAIS goals.json si les éléments sont des chaînes de texte.
        """
        data = self.load()
        raw_goals = data.get("goals", [])
        
        clean_goals = []
        needs_save = False

        for g in raw_goals:
            if isinstance(g, dict):
                if "last_checked" not in g:
                    g["last_checked"] = "1970-01-01T00:00:00"
                    needs_save = True
                if g.get("enabled", True):
                    clean_goals.append(g)
            else:
                # Si c'est du texte simple (ex: "beast of réincarnation - build"), on le garde tel quel
                clean_goals.append(g)
        
        if needs_save:
            self._save_data(data)

        return clean_goals

    def update_goal_timestamp(self, goal_name: str):
        """
        Met à jour la date de dernière vérification pour un objectif (si c'est un dictionnaire).
        """
        data = self.load()
        found = False
        now = datetime.now().isoformat(timespec='seconds')

        goals_list = data.get("goals", [])
        for g in goals_list:
            if isinstance(g, dict):
                if g.get("name") == goal_name or g.get("id") == goal_name:
                    g["last_checked"] = now
                    found = True
                    break
        
        if found:
            self._save_data(data)

    def _save_data(self, data: dict):
        """Méthode privée pour écrire le fichier JSON proprement."""
        try:
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ [GoalManager] Erreur lors de la sauvegarde : {e}")