import requests
from core.logger import setup_logger
from core.config_manager import ConfigManager  # On utilise TON manager !

logger = setup_logger("LLMClient")
config_manager = ConfigManager()
config_manager.load_config()  # On charge la configuration (Tavily, endpoints, etc.)

def ask_llm(prompt, endpoint=None):
    """Envoie un prompt à llama.cpp (compatible OpenAI API) et récupère la réponse."""
    
    # Si l'endpoint n'est pas passé, on cherche "llama_cpp_endpoint", 
    # puis "lm_studio_endpoint", sinon fallback sur http://127.0.0.1:8080/v1/chat/completions
    if not endpoint:
        endpoint = config_manager.get(
            "llama_cpp_endpoint", 
            config_manager.get("lm_studio_endpoint", "http://127.0.0.1:8080/v1/chat/completions")
        )

    payload = {
        "model": "local-model",  # llama.cpp ignore le nom mais le champ reste requis
        "messages": [
            {
                "role": "system",
                "content": "Tu es l'assistant de recherche de Maya. Synthétise les informations de manière claire, concise et factuelle."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.3  # On veut du factuel ! 😉
    }
    
    try:
        logger.info(f"Envoi du prompt à llama.cpp ({endpoint})...")
        response = requests.post(endpoint, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()
        
        content = data["choices"][0]["message"]["content"]
        logger.info("Réponse reçue de llama.cpp avec succès.")
        return content

    except Exception as e:
        error_msg = f"Erreur lors de la communication avec llama.cpp : {e}"
        logger.error(error_msg)
        return f"Erreur : {error_msg}. (Vérifie que le serveur llama.cpp est bien démarré et que l'URL dans config.json est correcte)"

# Petit test rapide si on lance le fichier directement
if __name__ == "__main__":
    print("--- TEST LLM CLIENT (LLAMA.CPP) ---")
    test_prompt = "Dis-moi bonjour, Maya !"
    print(f"Prompt: {test_prompt}")
    print(f"Réponse: {ask_llm(test_prompt)}")