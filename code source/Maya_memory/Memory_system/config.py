from pathlib import Path

# Racine calculée dynamiquement par rapport à la position de config.py
BASE_DIR = Path(__file__).resolve().parent.parent
MEMORY_PATH = BASE_DIR / "Memory"

# Fichiers texte de mémoire (1 ligne = 1 fait)
JOURNAL_RECENT = MEMORY_PATH / "journal_recent.txt"
JOURNAL_ANCIEN = MEMORY_PATH / "journal_ancien.txt"
MAYA_CORE = MEMORY_PATH / "Maya_core.txt"
CORE_HISTORY = MEMORY_PATH / "core_history.txt"
STATE_FILE = MEMORY_PATH / "memory_state.json"
STATUS_FILE = MEMORY_PATH / "status.txt" 

# Endpoint llama.cpp
LLAMACPP_URL = "http://localhost:8080/v1/chat/completions"
MODEL_NAME = "local-model"