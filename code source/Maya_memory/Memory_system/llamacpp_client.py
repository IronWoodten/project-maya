import re
import requests
from config import LLAMACPP_URL, MODEL_NAME


class LLMCommunicationError(Exception):
    """Levée quand l'appel au LLM échoue techniquement (réseau, HTTP, parsing,
    contenu vide/None) — à ne JAMAIS confondre avec une réponse légitime du
    LLM du type "AUCUN"."""


def ask_llm(prompt: str, system_prompt: str = None) -> str:
    """Envoie une requête au serveur llama.cpp via l'API OpenAI compatible.

    Renvoie le contenu texte de la réponse.
    Lève LLMCommunicationError en cas d'échec technique (à l'appelant de
    décider comment logger/gérer ça, plutôt que de recevoir silencieusement
    une chaîne vide indiscernable d'un "AUCUN" légitime).
    """
    if system_prompt is None:
        system_prompt = (
            "Tu es le module de consolidation de mémoire long terme d'une IA. "
            "Ton rôle est d'analyser, normaliser et vérifier les faits de façon stricte et concise.\n\n"
            "CONSIGNE TECHNIQUE : Ne génère pas de balise <think> ni de bloc de réflexion. "
            "Réponds directement, sans raisonnement visible, au format demandé."
        )

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "stop": [
            "<end_of_turn>", "<eos>",
            "<|im_end|>", "<|eot_id|>", "</s>", "<|endoftext|>",
            "<think>", "</think>"
        ],
        "chat_template_kwargs": {"enable_thinking": False},
        "max_tokens": 10000
    }

    try:
        response = requests.post(
            LLAMACPP_URL,
            json=payload,
            timeout=120
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if content is None:
            raise LLMCommunicationError(
                "Le serveur a répondu 200 OK mais content=None "
                "(souvent un signe de dépassement de contexte)"
            )
        # Filet de sécurité : au cas où un bloc de réflexion passerait quand
        # même malgré chat_template_kwargs/stop (cf. cleanContent côté llm.js)
        content = re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.IGNORECASE)
        return content.strip()
    except LLMCommunicationError:
        raise
    except Exception as e:
        raise LLMCommunicationError(f"Communication échouée : {e}") from e