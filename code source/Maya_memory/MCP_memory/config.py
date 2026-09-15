import os

# 1. Emplacement exact du fichier config.py (ex: .../Maya_memory/Memory_system ou .../Maya_memory/MCP_memory)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Racine parent : Maya_memory (on remonte d'un niveau avec '..')
MAYA_MEMORY_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

# 3. Dossier 'Memory' qui contient les 4 fichiers .txt
MEMORY_DIR = os.path.join(MAYA_MEMORY_DIR, "Memory")

# --- Les 4 fichiers de mémoire ---
JOURNAL_RECENT = os.path.join(MEMORY_DIR, "journal_recent.txt")
JOURNAL_ANCIEN = os.path.join(MEMORY_DIR, "journal_ancien.txt")
MAYA_CORE = os.path.join(MEMORY_DIR, "Maya_core.txt")
CORE_HISTORY = os.path.join(MEMORY_DIR, "core_history.txt")

# --- Fichiers d'état et métadonnées ---
MEMORY_STATE = os.path.join(MEMORY_DIR, "memory_state.json")
STATUS_FILE = os.path.join(MEMORY_DIR, "status.txt")

# --- Liste des dossiers autorisés (100% dynamique) ---
ALLOWED_DIRECTORIES = [
    MEMORY_DIR
]