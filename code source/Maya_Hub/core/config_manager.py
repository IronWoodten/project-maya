import json
import os
from core.logger import setup_logger

class ConfigManager:
    def __init__(self, config_path="config.json"):
        # On initialise le logger pour la config
        self.logger = setup_logger("ConfigManager")
        # Si on ne donne pas de chemin, il cherche "config.json" à la racine
        self.config_path = config_path
        self.config_data = {}

    def load_config(self):
        """Charge les données du fichier JSON."""
        if not os.path.exists(self.config_path):
            self.logger.warning(f"Fichier de configuration non trouvé à : {self.config_path}. Utilisation des valeurs par défaut.")
            # Valeurs par défaut si le fichier n'existe pas encore
            self.config_data = {
                "plugin_dir": "plugins",
                "log_level": "DEBUG"
            }
        else:
            try:
                with open(self.config_path, 'r') as f:
                    self.config_data = json.load(f)
                self.logger.info(f"Configuration chargée avec succès depuis {self.config_path}")
            except Exception as e:
                self.logger.error(f"Erreur lors de la lecture du fichier config : {e}")

    def get(self, key, default=None):
        """Récupère une valeur dans la config."""
        return self.config_data.get(key, default)

    def set(self, key, value):
        """Modifie une valeur en mémoire dans la config."""
        self.config_data[key] = value

    def save_config(self):
        """Écrit l'état actuel de la config sur le disque (persistance)."""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config_data, f, indent=4)
            self.logger.info(f"Configuration sauvegardée avec succès dans {self.config_path}")
        except Exception as e:
            self.logger.error(f"Erreur lors de l'écriture du fichier config : {e}")
