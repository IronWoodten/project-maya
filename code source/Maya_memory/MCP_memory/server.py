import os
import sys

# Ajout du dossier parent au path pour pouvoir importer config.py proprement
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.server.fastmcp import FastMCP
from Memory_system.config import JOURNAL_ANCIEN

# Initialisation du serveur MCP
mcp = FastMCP("Maya Memory Server")

@mcp.tool()
def search_old_memory(query: str) -> str:
    """
    Recherche dans les archives anciennes de la mémoire de Maya (journal_ancien.txt).
    Retourne les blocs d'enregistrements qui contiennent le mot-clé ou la phrase recherchée.
    """
    if not os.path.exists(JOURNAL_ANCIEN):
        return "Le journal ancien est vide ou n'existe pas encore."

    try:
        with open(JOURNAL_ANCIEN, "r", encoding="utf8") as f:
            content = f.read()
        
        if not content.strip():
            return "Le journal ancien est actuellement vide."

        query_lower = query.lower()
        # Découpage par bloc d'enregistrement
        blocks = content.split("Fin d'enregistrement")
        results = []
        
        for block in blocks:
            if query_lower in block.lower():
                results.append(block.strip() + "\nFin d'enregistrement")
        
        if results:
            return "\n\n---\n\n".join(results)
        else:
            return f"Aucun souvenir correspondant à '{query}' n'a été trouvé dans l'archive ancienne."
            
    except Exception as e:
        return f"Erreur lors de la lecture des archives : {str(e)}"

if __name__ == "__main__":
    print("Démarrage du Serveur MCP Mémoire de Maya...")
    mcp.run()