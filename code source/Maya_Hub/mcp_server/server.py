import sys
import time
import json
import ast
import asyncio
import traceback
import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
import mcp.types as types

HUB_URL = "http://127.0.0.1:5005"

server = Server("Maya Hub")

# Rempli au démarrage : { tool_name: {"plugin": ..., "action": ..., "description": ...} }
TOOL_REGISTRY = {}


async def call_hub(plugin, action, params):
    """Envoie une commande au Maya Hub (Flask sur port 5005) de manière asynchrone avec timeout étendu."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{HUB_URL}/api/execute",
                json={
                    "plugin": plugin,
                    "action": action,
                    "params": params
                }
            )
            return response.json()
    except Exception as e:
        print(f"[Erreur call_hub] {e}", file=sys.stderr)
        return {"error": str(e)}


def get_tools():
    """Récupère la liste des outils depuis le Hub Flask."""
    import requests
    for attempt in range(1, 11):
        try:
            response = requests.get(f"{HUB_URL}/api/tools", timeout=3)
            if response.status_code == 200:
                data = response.json()
                tools = data.get("tools", [])
                print(f"✅ Connecté au Hub 5005 : {len(tools)} outils trouvés.", file=sys.stderr)
                return tools
        except Exception as e:
            print(f"[Attente Hub 5005...] Essai {attempt}/10 - ({e})", file=sys.stderr)
            time.sleep(1)

    print("⚠️ Impossible de contacter le Hub sur http://127.0.0.1:5005", file=sys.stderr)
    return []


def parse_stringified_dict(val):
    """Tente de convertir une chaîne de caractères '{...}' en dictionnaire Python réel."""
    if isinstance(val, str) and val.strip().startswith("{") and val.strip().endswith("}"):
        try:
            return json.loads(val)
        except Exception:
            try:
                return ast.literal_eval(val)
            except Exception:
                pass
    return val


def clean_arguments(kwargs: dict) -> dict:
    """Déballage dynamique et normalisation des arguments (logique identique à avant)."""
    clean_params = {}

    for key, val in (kwargs or {}).items():
        parsed_val = parse_stringified_dict(val)
        if isinstance(parsed_val, dict):
            clean_params.update(parsed_val)
        elif key == "kwargs" and isinstance(val, dict):
            clean_params.update(val)
        elif key == "kwargs" and isinstance(val, str):
            clean_params["query"] = val
        else:
            clean_params[key] = val

    if "query" in clean_params and isinstance(clean_params["query"], str):
        parsed_query = parse_stringified_dict(clean_params["query"])
        if isinstance(parsed_query, dict):
            del clean_params["query"]
            clean_params.update(parsed_query)

    if "query" not in clean_params and clean_params:
        first_str_val = next((v for v in clean_params.values() if isinstance(v, str) and v.strip()), None)
        if first_str_val:
            clean_params["query"] = first_str_val

    return clean_params


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    tools = []
    for name, info in TOOL_REGISTRY.items():
        raw_params = info.get("parameters") or {}

        # Deux formats possibles selon le plugin d'origine :
        # 1. Format plat {nom_param: "description texte"} (ex: filesystem, memory)
        # 2. Schéma JSON déjà complet {"type": "object", "properties": {...},
        #    "required": [...]} (ex: research, dont plugin.py fournit directement
        #    un vrai JSON Schema). Sans cette distinction, le format 2 était
        #    ré-emballé comme si "properties"/"required"/"type" étaient eux-mêmes
        #    des noms de paramètres, ce qui plantait la validation du schéma
        #    (ex: "properties" prenait tout son sous-dict comme "description",
        #    qui doit être une string -> erreur de validation JSON Schema).
        if isinstance(raw_params, dict) and isinstance(raw_params.get("properties"), dict):
            properties = raw_params["properties"]
            required = raw_params.get("required", list(properties.keys()))
        else:
            properties = {
                param_name: {"type": "string", "description": param_desc}
                for param_name, param_desc in raw_params.items()
            }
            required = list(properties.keys())

        tools.append(
            types.Tool(
                name=name,
                description=info["description"],
                inputSchema={
                    "type": "object",
                    # Propriétés explicites (noms + descriptions) quand on les connaît,
                    # pour que le LLM sache exactement quoi remplir (ex: write_file
                    # a besoin de 'path' ET 'content', pas juste un seul champ deviné).
                    "properties": properties,
                    "required": required,
                    # On reste permissif en plus, au cas où le modèle nomme un champ différemment.
                    "additionalProperties": True,
                },
            )
        )
    return tools


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    print(f"📥 [call_tool] reçu : name={name} arguments={arguments}", file=sys.stderr)

    info = TOOL_REGISTRY.get(name)
    if info is None:
        msg = f"Outil inconnu : {name}"
        print(f"❌ {msg}", file=sys.stderr)
        return [types.TextContent(type="text", text=json.dumps({"error": msg}))]

    try:
        clean_params = clean_arguments(arguments)
        print(f"🧹 Paramètres nettoyés pour {info['plugin']}.{info['action']} -> {clean_params}", file=sys.stderr)
        result = await call_hub(info["plugin"], info["action"], clean_params)
        return [types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]
    except Exception:
        tb = traceback.format_exc()
        print(f"💥 Exception dans call_tool({name}) :\n{tb}", file=sys.stderr)
        return [types.TextContent(type="text", text=json.dumps({"error": tb}))]


def load_registry():
    hub_tools = get_tools()
    for tool in hub_tools:
        plugin_name = tool["plugin"]
        action_name = tool["action"]
        description = tool.get("description", f"Outil {plugin_name} - {action_name}")
        tool_name = f"{plugin_name}_{action_name}"

        TOOL_REGISTRY[tool_name] = {
            "plugin": plugin_name,
            "action": action_name,
            "description": description,
            "parameters": tool.get("parameters") or {},
        }
        params_found = tool.get("parameters") or {}
        print(
            f"🔧 Outil MCP enregistré : {tool_name} (paramètres : {list(params_found.keys()) or 'AUCUN — /api/tools ne renvoie pas de parameters !'})",
            file=sys.stderr,
        )


async def main():
    load_registry()
    print("🚀 Maya Hub MCP prêt et prêt à recevoir des commandes", file=sys.stderr)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
