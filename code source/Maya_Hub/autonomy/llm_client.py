import aiohttp
import json
import logging

logger = logging.getLogger("LlamaCppClient")

class LlamaCppClient:
    def __init__(self, url: str = "http://localhost:8080/v1/chat/completions"):
        self.url = url

    async def chat(self, messages: list, tools: list = None) -> dict:
        payload = {
            "messages": messages,
            "temperature": 0.2
        }
        
        if tools:
            formatted_tools = []
            
            # Extraction propre de la liste d'outils
            target_list = []
            if isinstance(tools, list):
                target_list = tools
            elif isinstance(tools, dict):
                target_list = tools.get("tools", [])

            for t in target_list:
                # Normalisation des paramètres au format JSON Schema requis par llama.cpp
                raw_params = t.get("parameters", {})
                
                # Si les paramètres sont déjà un schéma JSON complet
                if isinstance(raw_params, dict) and "properties" in raw_params:
                    properties = raw_params.get("properties", {})
                    required = raw_params.get("required", [])
                elif isinstance(raw_params, dict):
                    # Si c'est un dictionnaire simple de propriétés
                    properties = raw_params
                    required = list(properties.keys())
                else:
                    properties = {}
                    required = []

                # Formatage STRICT OpenAI / llama.cpp
                new_tool = {
                    "type": "function",
                    "function": {
                        "name": t.get("name", t.get("action", "unknown_tool")),
                        "description": t.get("description", "Aucune description fournie."),
                        "parameters": {
                            "type": "object",
                            "properties": properties,
                            "required": required
                        }
                    }
                }
                formatted_tools.append(new_tool)

            payload["tools"] = formatted_tools

        async with aiohttp.ClientSession() as session:
            async with session.post(self.url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"llama.cpp Error ({response.status}): {error_text}")
                return await response.json()

# Alias pour maintenir la rétrocompatibilité si importé ailleurs
LMStudioClient = LlamaCppClient