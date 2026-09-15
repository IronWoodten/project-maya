import logging
import os
import sys

def setup_logger(name="MayaHub"):
    # On crée un dossier 'logs' s'il n'existe pas
    if not os.path.exists("logs"):
        os.makedirs("logs")

    logger = logging.getLogger(name)
    
    # Éviter d'ajouter des handlers multiples
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)

        # Format du log : [TIMESTAMP] [NOM] - MESSAGE
        formatter = logging.Formatter('%(asctime)s [%(name)s] %(levelname)s - %(message)s')

        # --- CONSOLE HANDLER (Avec encodage UTF-8 forcé pour les emojis) ---
        # On utilise sys.stdout et on s'assure que l'encodage est géré
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # --- FILE HANDLER (En UTF-8 pour les logs) ---
        file_handler = logging.FileHandler("logs/maya_hub.log", encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger
