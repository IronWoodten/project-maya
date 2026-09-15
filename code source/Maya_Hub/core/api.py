from flask import Blueprint, request, jsonify

# Création du blueprint
api_bp = Blueprint('api', __name__)

# Injection des dépendances
plugin_manager = None
idle_manager = None 
global_scheduler = None

# --- GESTION DU JOURNAL D'ÉVÉNEMENTS (LOGS) ---
hub_logs = []

def log_event(log_type, source, message):
    """
    Enregistre un événement dans le journal du Hub.
    log_type: 'mcp', 'learning', 'search', 'system', 'error'
    """
    hub_logs.append({
        "type": log_type,
        "source": source,
        "message": message
    })
    # Garder les 50 derniers événements pour éviter d'encombrer la mémoire
    if len(hub_logs) > 50:
        hub_logs.pop(0)


def init_api(manager, idle_mgr=None, scheduler=None):
    """
    Initialise l'API avec le PluginManager, le gestionnaire d'inactivité et le Scheduler.
    """
    global plugin_manager, idle_manager, global_scheduler
    plugin_manager = manager
    idle_manager = idle_mgr
    if scheduler is not None:
        global_scheduler = scheduler
    log_event("system", "Hub Maya", "API initialisée avec succès.")


def find_plugin(real_id):
    """
    Recherche un plugin avec son ID stable.
    """
    if plugin_manager is None:
        return None, None

    plugins_dict = plugin_manager.plugins if hasattr(plugin_manager, "plugins") else plugin_manager

    for name, plugin in plugins_dict.items():
        plugin_id = getattr(plugin, "id", "")
        if plugin_id == real_id or name == real_id:
            return name, plugin

    return None, None


# --- NOUVELLE ROUTE API : JOURNAL DES LOGS ---
@api_bp.route('/logs', methods=['GET'])
def get_logs():
    """Retourne la liste des événements enregistrés pour le front-end."""
    return jsonify(hub_logs)


@api_bp.route('/execute', methods=['POST'])
def execute_action():
    global idle_manager

    if plugin_manager is None:
        return jsonify({"status": "error", "message": "PluginManager non initialisé."}), 500

    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "JSON manquant."}), 400

    # Notification d'activité pour l'autonomie
    if idle_manager is not None:
        idle_manager.update_activity()

    plugin_id = data.get("plugin")
    action = data.get("action")
    params = data.get("params", {})

    if not plugin_id or not action:
        return jsonify({"status": "error", "message": "Le corps doit contenir 'plugin' et 'action'."}), 400

    real_name, plugin = find_plugin(plugin_id)

    if plugin is None:
        log_event("error", "Plugin System", f"Plugin '{plugin_id}' introuvable ou désactivé.")
        return jsonify({"status": "error", "message": f"Plugin '{plugin_id}' introuvable ou désactivé."}), 404

    try:
        result = plugin_manager.execute_capability(real_name, action, params)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        error_msg = f"Exception dans {real_name}.{action} : {e}"
        log_event("error", real_name, error_msg)
        print(f"💥 [/api/execute] {error_msg}\n{tb}")
        return jsonify({
            "status": "error",
            "plugin": plugin_id,
            "action": action,
            "message": error_msg
        }), 200

    # On enregistre l'exécution dans le journal de logs
    log_event("mcp", real_name, f"Action '{action}' exécutée.")

    return jsonify({
        "status": "success",
        "plugin": plugin_id,
        "action": action,
        "result": result
    })


@api_bp.route('/plugins', methods=['GET'])
def list_plugins():
    """Retourne uniquement les plugins actuellement chargés en mémoire."""
    if plugin_manager is None:
        return jsonify({"status": "error", "message": "PluginManager non initialisé."}), 500

    plugins_info = {}
    for name, plugin in plugin_manager.plugins.items():
        plugins_info[name] = {
            "id": getattr(plugin, "id", ""),
            "description": getattr(plugin, "description", ""),
            "capabilities": plugin_manager.capabilities.get(name, [])
        }

    return jsonify({"status": "success", "plugins": plugins_info})


@api_bp.route('/all_plugins', methods=['GET'])
def list_all_plugins():
    """Retourne l'intégralité des plugins du dossier (chargés ou désactivés)."""
    if plugin_manager is None:
        return jsonify({"status": "error", "message": "PluginManager non initialisé."}), 500

    if hasattr(plugin_manager, "get_all_plugins_status"):
        plugins_list = plugin_manager.get_all_plugins_status()
    else:
        plugins_list = []

    return jsonify({"status": "success", "plugins": plugins_list})


@api_bp.route('/toggle_plugin', methods=['POST'])
def toggle_plugin():
    """Active ou désactive un plugin dans la configuration."""
    if plugin_manager is None:
        return jsonify({"status": "error", "message": "PluginManager non initialisé."}), 500

    data = request.get_json() or {}
    plugin_id = data.get("plugin_id")
    enabled = data.get("enabled")

    if plugin_id is None or enabled is None:
        return jsonify({"status": "error", "message": "Champs 'plugin_id' et 'enabled' requis."}), 400

    enabled_config = plugin_manager._get_enabled_config()
    enabled_config[plugin_id] = bool(enabled)
    plugin_manager._save_enabled_config(enabled_config)

    status_str = "activé" if enabled_config[plugin_id] else "désactivé"
    log_event("system", "Plugin Manager", f"Plugin '{plugin_id}' {status_str}.")

    return jsonify({
        "status": "success",
        "plugin_id": plugin_id,
        "enabled": enabled_config[plugin_id],
        "message": "Configuration mise à jour. Redémarrez le Hub pour appliquer les changements."
    })


@api_bp.route('/toggle_service', methods=['POST', 'OPTIONS'])
def toggle_service():
    """Active ou désactive un service (ex: autolearning) dans la configuration et en mémoire."""
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    if plugin_manager is None:
        return jsonify({"status": "error", "message": "PluginManager non initialisé."}), 500

    data = request.get_json() or {}
    service_id = data.get("service_id") or data.get("service") or data.get("id")
    enabled = data.get("enabled")

    if service_id is None or enabled is None:
        return jsonify({"status": "error", "message": "Champs 'service_id' et 'enabled' requis."}), 400

    enabled_bool = bool(enabled)

    # 1. Mise à jour de l'état en mémoire du Scheduler
    if service_id == "autolearning" and global_scheduler is not None:
        global_scheduler.enabled = enabled_bool
        print(f"⚙️ Autolearning {'ACTIVÉ' if enabled_bool else 'DÉSACTIVÉ'}")

    # 2. Sauvegarde dans la configuration JSON
    config_obj = plugin_manager.config
    services = {}

    if hasattr(config_obj, "get"):
        services = config_obj.get("services", {})
    elif hasattr(config_obj, "config") and isinstance(config_obj.config, dict):
        services = config_obj.config.get("services", {})

    services[service_id] = enabled_bool

    if hasattr(config_obj, "set"):
        config_obj.set("services", services)
        if hasattr(config_obj, "save_config"):
            config_obj.save_config()
    elif hasattr(config_obj, "config") and isinstance(config_obj.config, dict):
        config_obj.config["services"] = services
        if hasattr(config_obj, "save_config"):
            config_obj.save_config()

    status_str = "activé" if enabled_bool else "désactivé"
    log_event("learning" if "learning" in str(service_id) else "system", "Service Manager", f"Service '{service_id}' {status_str}.")

    return jsonify({
        "status": "success",
        "service_id": service_id,
        "enabled": enabled_bool
    })


@api_bp.route('/tools', methods=['GET'])
def list_tools():
    if plugin_manager is None:
        return jsonify({"status": "error", "message": "PluginManager non initialisé."}), 500

    tools = []
    for plugin_name, plugin in plugin_manager.plugins.items():
        plugin_id = getattr(plugin, "id", plugin_name)
        plugin_tools = getattr(plugin, "tools", {})

        if isinstance(plugin_tools, dict):
            for action, info in plugin_tools.items():
                tools.append({
                    "name": f"{plugin_id}.{action}",
                    "plugin": plugin_id,
                    "display_name": plugin_name,
                    "action": action,
                    "description": info.get("description", ""),
                    "parameters": info.get("parameters", {})
                })

    return jsonify({"status": "success", "tools": tools})


@api_bp.route('/status', methods=['GET'])
def hub_status():
    if plugin_manager is None:
        return jsonify({"status": "error", "message": "PluginManager non initialisé."}), 500

    return jsonify({
        "status": "online",
        "active_plugins": [
            getattr(plugin, "id", name)
            for name, plugin in plugin_manager.plugins.items()
        ],
        "plugin_count": len(plugin_manager.plugins)
    })