import importlib.util
import json
import os
import sys
from core.logger import setup_logger

class PluginManager:
    def __init__(self, config):
        self.logger = setup_logger("PluginManager")
        self.config = config  # ConfigManager instance
        self.plugins = {}
        self.capabilities = {}

        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.plugin_dir = os.path.normpath(os.path.join(base_dir, "..", "plugins"))
        self.logger.info(f"Dossier de plugins : {self.plugin_dir}")

    def _get_enabled_config(self):
        """Récupère le dictionnaire plugins_enabled depuis ConfigManager."""
        if hasattr(self.config, "get"):
            return self.config.get("plugins_enabled", {})
        elif hasattr(self.config, "config") and isinstance(self.config.config, dict):
            return self.config.config.get("plugins_enabled", {})
        elif isinstance(self.config, dict):
            return self.config.get("plugins_enabled", {})
        return {}

    def _save_enabled_config(self, enabled_dict):
        """Met à jour et sauvegarde la configuration."""
        if hasattr(self.config, "set"):
            self.config.set("plugins_enabled", enabled_dict)
            if hasattr(self.config, "save_config"):
                self.config.save_config()
        elif hasattr(self.config, "config") and isinstance(self.config.config, dict):
            self.config.config["plugins_enabled"] = enabled_dict
            if hasattr(self.config, "save_config"):
                self.config.save_config()
        elif isinstance(self.config, dict):
            self.config["plugins_enabled"] = enabled_dict

    def discover_plugins(self):
        self.logger.info("--- SCAN RADAR ---")
        if not os.path.exists(self.plugin_dir):
            self.logger.error(f"Le dossier {self.plugin_dir} n'existe pas")
            return []

        found_plugins = []
        enabled_config = self._get_enabled_config()
        config_updated = False

        folders = [f for f in os.listdir(self.plugin_dir) if os.path.isdir(os.path.join(self.plugin_dir, f))]

        for folder_name in folders:
            folder_path = os.path.join(self.plugin_dir, folder_name)
            plugin_id = folder_name

            # Vérification ou initialisation de l'état dans config.json
            if plugin_id not in enabled_config:
                enabled_config[plugin_id] = True
                config_updated = True

            # Si le plugin est désactivé dans la config, on l'ignore
            if not enabled_config.get(plugin_id, True):
                self.logger.info(f"⏸️ Plugin ignoré (désactivé dans la config) : {plugin_id}")
                continue

            try:
                plugin_module = self._load_module(folder_path)

                if not hasattr(plugin_module, "get_instance"):
                    self.logger.warning(f"{folder_name} n'a pas get_instance()")
                    continue

                try:
                    instance = plugin_module.get_instance(hub=self)
                except TypeError:
                    instance = plugin_module.get_instance()

                plugin_id = getattr(instance, "id", folder_name)
                plugin_name = getattr(instance, "name", plugin_id)

                self.plugins[plugin_id] = instance

                # Gestion des capacités
                caps = getattr(instance, "capabilities", [])
                if not caps and hasattr(instance, "get_capabilities"):
                    caps = instance.get_capabilities()
                self.capabilities[plugin_id] = list(caps)

                self.logger.info(f"✅ Plugin chargé : {plugin_id} ({plugin_name})")
                found_plugins.append(plugin_id)

                # Log dans le journal Hub (sans risque d'import circulaire)
                try:
                    from api import log_event
                    log_event("mcp", plugin_name, f"Plugin chargé avec succès.")
                except Exception:
                    pass

            except Exception as e:
                self.logger.error(f"❌ Erreur chargement {folder_name} : {e}")

        if config_updated:
            self._save_enabled_config(enabled_config)

        return found_plugins

    def get_all_plugins_status(self):
        """
        Scanne le dossier plugins/ pour retourner la liste complète de TOUS les plugins
        (qu'ils soient chargés ou désactivés) pour l'API et l'UI.
        """
        all_status = []
        enabled_config = self._get_enabled_config()

        if not os.path.exists(self.plugin_dir):
            return all_status

        folders = [f for f in os.listdir(self.plugin_dir) if os.path.isdir(os.path.join(self.plugin_dir, f))]

        for folder_name in folders:
            folder_path = os.path.join(self.plugin_dir, folder_name)
            manifest_path = os.path.join(folder_path, "manifest.json")

            plugin_id = folder_name
            plugin_name = folder_name.capitalize()

            # Tente de lire le nom propre dans manifest.json s'il existe
            if os.path.exists(manifest_path):
                try:
                    with open(manifest_path, "r", encoding="utf-8") as f:
                        manifest = json.load(f)
                        plugin_id = manifest.get("id", plugin_id)
                        plugin_name = manifest.get("name", plugin_name)
                except Exception:
                    pass

            is_enabled = enabled_config.get(plugin_id, True)
            is_loaded = plugin_id in self.plugins

            all_status.append({
                "id": plugin_id,
                "name": plugin_name,
                "enabled": is_enabled,
                "loaded": is_loaded
            })

        return all_status

    def _load_module(self, path):
        module_name = os.path.basename(path)
        plugin_file = os.path.join(path, "plugin.py")
        spec = importlib.util.spec_from_file_location(module_name, plugin_file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module

    async def get_tools(self):
        """
        Récupère la liste de tous les outils (tools) disponibles via les plugins chargés,
        au format OpenAI function-calling (compatible llama.cpp / llama-server).
        Utilisé par l'Executor pour informer le LLM des capacités du Hub.

        Les noms d'outils sont générés au format "plugin_id.action_name" (avec un POINT),
        car c'est ce que autonomy/executor.py attend pour router l'appel :
            plugin_id, action_name = tool_name.split(".", 1)
        """
        all_tools = []
        for plugin_id, instance in self.plugins.items():
            try:
                plugin_tools = getattr(instance, "tools", None)

                # Support optionnel d'une méthode get_tools() custom sur le plugin
                if hasattr(instance, "get_tools"):
                    import inspect
                    if inspect.iscoroutinefunction(instance.get_tools):
                        plugin_tools = await instance.get_tools()
                    else:
                        plugin_tools = instance.get_tools()

                # Cas normal (tous les plugins actuels) : tools est un dict
                # {action_name: {"description": ..., "parameters": {...}}}
                if isinstance(plugin_tools, dict):
                    for action_name, tool_def in plugin_tools.items():
                        if not isinstance(tool_def, dict):
                            continue

                        params = tool_def.get("parameters", {})

                        # Normalise l'ancien format plat {"param": "description texte"}
                        # en JSON Schema valide {"type": "object", "properties": {...}}
                        if isinstance(params, dict) and params.get("type") != "object":
                            properties = {
                                pname: {"type": "string", "description": str(pdesc)}
                                for pname, pdesc in params.items()
                            }
                            params = {
                                "type": "object",
                                "properties": properties,
                                "required": list(properties.keys()),
                            }

                        all_tools.append({
                            "type": "function",
                            "function": {
                                "name": f"{plugin_id}.{action_name}",
                                "description": tool_def.get("description", ""),
                                "parameters": params,
                            },
                        })

                # Cas alternatif : tools est déjà une liste au format OpenAI
                elif isinstance(plugin_tools, list):
                    all_tools.extend(plugin_tools)

            except Exception as e:
                self.logger.error(f"Erreur lors de la récupération des outils du plugin {plugin_id}: {e}")

        return all_tools

    def execute_action(self, plugin_id: str, action_name: str, params: dict = None):
        """Méthode ultra-robuste pour appeler un plugin via le Hub."""
        if plugin_id not in self.plugins:
            self.logger.error(f"Plugin {plugin_id} introuvable")
            try:
                from api import log_event
                log_event("error", plugin_id, f"Plugin introuvable lors de l'action '{action_name}'")
            except Exception:
                pass
            return f"Plugin {plugin_id} introuvable"

        plugin = self.plugins[plugin_id]

        if params is None:
            params = {}

        self.logger.info(f"🚀 Hub -> Exécution de '{action_name}' sur le plugin '{plugin_id}' avec {params}")

        # Enregistrement du log de début d'exécution
        try:
            from api import log_event
            log_event("mcp", plugin_id, f"Exécution de '{action_name}'")
        except Exception:
            pass

        # 1. Système moderne : On utilise la méthode 'run(action, params)'
        if hasattr(plugin, "run"):
            try:
                res = plugin.run(action_name, params)
                return res
            except Exception as e:
                self.logger.error(f"Erreur dans le plugin.run de {plugin_id}: {e}")
                try:
                    from api import log_event
                    log_event("error", plugin_id, f"Erreur dans '{action_name}': {e}")
                except Exception:
                    pass
                return f"Erreur d'exécution : {e}"

        # 2. Système de secours (Fallback) : Appel direct de la méthode
        method = getattr(plugin, action_name, None)
        if method and callable(method):
            try:
                res = method(**params)
                return res
            except Exception as e:
                self.logger.error(f"Erreur appel direct de {action_name} dans {plugin_id}: {e}")
                try:
                    from api import log_event
                    log_event("error", plugin_id, f"Erreur dans '{action_name}': {e}")
                except Exception:
                    pass
                return f"Erreur d'exécution : {e}"

        return f"Action '{action_name}' introuvable dans le plugin '{plugin_id}'"

    def execute_capability(self, plugin_id: str, capability_name: str, params: dict = None):
        return self.execute_action(plugin_id, capability_name, params)
