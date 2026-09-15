import asyncio
import logging
import json
from datetime import datetime

try:
    from core.api import log_event
except ImportError:
    def log_event(category, source, message):
        pass

try:
    from autonomy.prompts import AUTONOMOUS_ACTION
except ImportError:
    AUTONOMOUS_ACTION = "Goal: {goal}\nDate: {current_date}"

logger = logging.getLogger("Executor")


class Executor:
    def __init__(self, llm_client, hub_client, max_iterations: int = 5):
        self.llm = llm_client
        self.hub = hub_client  # <- ici c'est en fait ton PluginManager (p_manager)
        self.max_iterations = max_iterations
        logger.info("🤖 [EXECUTOR] Initialisé !")

    async def execute(self, goal: dict, history_manager=None) -> str:
        if isinstance(goal, str):
            goal = {"id": goal, "name": goal, "prompt": goal}

        goal_id = goal.get('id', 'UNKNOWN_ID')
        goal_name = goal.get('name', goal.get('description', 'Unnamed Goal'))

        current_date_str = datetime.now().strftime("%d/%m/%Y %H:%M")
        log_msg_start = f"🚀 DÉBUT DE MISSION : {goal_name}"
        logger.info(f"🚀 [EXECUTOR] --- {log_msg_start} ---")
        log_event("learning", "Autonomie", log_msg_start)

        # 1. Chargement des outils via PluginManager.get_tools() (async)
        tools = []
        try:
            tools = await self.hub.get_tools()
            log_event("learning", "Autonomie", f"🛠️ {len(tools)} outils chargés pour la mission.")
            if not tools:
                nb_plugins = len(getattr(self.hub, "plugins", {}))
                log_event("learning", "Autonomie", f"ℹ️ Debug: {nb_plugins} plugins présents dans self.hub.plugins")
        except Exception as e:
            logger.warning(f"[Autonomie] Erreur chargement outils: {e}")
            log_event("learning", "Autonomie", f"⚠️ Erreur chargement outils: {e}")

        messages = [
            {
                "role": "system",
                "content": "Tu es Maya, une IA autonome. Tu exécutes des tâches d'apprentissage. Si la demande nécessite des informations web, utilise l'outil de recherche disponible."
            },
            {
                "role": "user",
                "content": AUTONOMOUS_ACTION.format(
                    goal=goal_name,
                    current_date=current_date_str
                )
            }
        ]

        iterations = 0
        final_content = ""

        while iterations < self.max_iterations:
            iterations += 1
            log_event("learning", "Autonomie", f"🧠 Réflexion Maya (Cycle {iterations}/{self.max_iterations})...")

            try:
                response_data = await self.llm.chat(messages, tools=tools if tools else None)

                if "choices" not in response_data or not response_data["choices"]:
                    log_event("learning", "Autonomie", "❌ Réponse vide reçue du LLM.")
                    break

                message = response_data["choices"][0]["message"]
                messages.append(message)

                content = message.get("content", "")
                if content:
                    final_content = content
                    log_event("learning", "Autonomie", f"💬 Résultat : {content[:150]}...")

                tool_calls = message.get("tool_calls")

                if not tool_calls:
                    break

                for tool_call in tool_calls:
                    call_id = tool_call.get("id", f"call_{iterations}")
                    function_data = tool_call.get("function", {})
                    tool_name = function_data.get("name")  # ex: "research.search_web"
                    raw_args = function_data.get("arguments", {})

                    if not tool_name:
                        continue

                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    except Exception:
                        args = {}

                    # Le PluginManager veut plugin_id et action_name SÉPARÉS
                    if "." in tool_name:
                        plugin_id, action_name = tool_name.split(".", 1)
                    else:
                        plugin_id = tool_name
                        action_name = tool_name

                    log_event("learning", "Autonomie", f"🔍 Lancement outil `{tool_name}` (plugin={plugin_id}, action={action_name}) avec : {args}")

                    try:
                        # execute_action est SYNCHRONE, pas de await
                        tool_result = self.hub.execute_action(plugin_id, action_name, args)
                    except Exception as tool_err:
                        tool_result = {"error": str(tool_err)}

                    if isinstance(tool_result, str) and ("introuvable" in tool_result or "Erreur" in tool_result):
                        log_event("learning", "Autonomie", f"❌ Outil `{tool_name}` en erreur : {tool_result}")
                    else:
                        log_event("learning", "Autonomie", f"✅ Outil `{tool_name}` exécuté avec succès.")

                    messages.append({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": tool_name,
                        "content": json.dumps(tool_result, ensure_ascii=False) if isinstance(tool_result, (dict, list)) else str(tool_result)
                    })

            except Exception as e:
                log_event("learning", "Autonomie", f"❌ Erreur durant le cycle : {e}")
                break

        final_response = final_content if final_content else "Mission exécutée."
        log_event("learning", "Autonomie", f"🎉 Mission terminée pour `{goal_name}`.")

        # --- AJOUT : sauvegarde de la synthèse finale du LLM dans la mémoire long terme ---
        # (en plus du résumé Tavily déjà sauvegardé automatiquement par le plugin research)
        if final_content:
            try:
                self.hub.execute_action("memory", "save_memory", {
                    "content": final_content,
                    "importance": 4,
                    "tags": ["mission_synthesis", str(goal_id)],
                    "type": "synthesis",
                    "source": [],
                    "confidence": 0.9
                })
                log_event("learning", "Autonomie", "💾 Synthèse finale de la mission sauvegardée en mémoire.")
            except Exception as e:
                log_event("learning", "Autonomie", f"⚠️ Erreur sauvegarde synthèse en mémoire : {e}")
        # --- FIN AJOUT ---

        return final_response
