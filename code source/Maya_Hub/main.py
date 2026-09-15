import os
import sys
import threading
import asyncio
import urllib.request
import json
import subprocess
import shutil
import time
import logging
from flask import Flask, render_template, request, jsonify
from core.logger import setup_logger
from core.config_manager import ConfigManager
from core.plugin_manager import PluginManager
from core.api import api_bp, init_api, log_event

# --- GESTION DU DOSSIER RACINE DU PROJET ---
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def resolve_path(relative_or_abs_path: str) -> str:
    if not relative_or_abs_path:
        return ""
    if os.path.isabs(relative_or_abs_path):
        return relative_or_abs_path
    return os.path.abspath(os.path.join(BASE_DIR, relative_or_abs_path))


# --- IMPORTS POUR L'AUTONOMIE ---
from autonomy.scheduler import Scheduler
from autonomy.goals import GoalManager
from autonomy.executor import Executor
from autonomy.history import HistoryManager

try:
    from autonomy.idle_manager import IdleManager
except ImportError:
    IdleManager = None


# --- VARIABLE GLOBALE POUR LE SCHEDULER ---
global_scheduler = None  # Permet à Flask d'accéder et modifier l'état du Scheduler


# --- ADAPTATEUR LLAMA.CPP POUR L'EXECUTOR ---
class LlamaCppClient:
    def __init__(self, base_url="http://localhost:8080/v1"):
        self.base_url = base_url.rstrip('/')

    async def chat(self, messages, tools=None):
        url = f"{self.base_url}/chat/completions" if not self.base_url.endswith("/chat/completions") else self.base_url
        
        payload = {
            "messages": messages,
            "temperature": 0.7,
            "stream": False
        }
        if tools:
            payload["tools"] = tools

        def _do_request():
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))

        loop = asyncio.get_running_loop()
        try:
            response = await loop.run_in_executor(None, _do_request)
            return response
        except Exception as e:
            return {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": f"[Erreur de connexion llama.cpp : {e}]"
                    }
                }]
            }


# --- CONFIGURATION DE L'APPLICATION ---
app = Flask(__name__, template_folder='templates')

# --- FILTRE POUR MASQUER LE POLLING BRUYANT ---
class QuietApiFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "/api/autonomy/status" in msg or "/api/logs" in msg:
            return False
        return True

logging.getLogger('werkzeug').addFilter(QuietApiFilter())

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
        return response

@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response


# --- INITIALISATION GLOBALE ---
config = ConfigManager()
config.load_config()

plugin_manager = PluginManager(config)
plugin_manager.discover_plugins()

idle_mgr_instance = IdleManager() if IdleManager else None
init_api(plugin_manager, idle_mgr_instance)


# --- ROUTE ACTIVATION / DÉSACTIVATION DES SERVICES (AUTOLEARNING) ---
@app.route('/api/toggle_service', methods=['POST', 'OPTIONS'])
def handle_toggle_service():
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    data = request.get_json() or {}
    service_id = data.get('service_id')
    enabled = bool(data.get('enabled', False))

    if service_id == 'autolearning':
        # 1. Mise à jour de l'instance Scheduler globale
        if global_scheduler:
            global_scheduler.enabled = enabled
        try:
            import core.api
            if hasattr(core.api, 'global_scheduler') and core.api.global_scheduler:
                core.api.global_scheduler.enabled = enabled
        except Exception:
            pass

        # 2. Enregistrement dans la configuration du serveur
        services_cfg = config.get("services", {}) if hasattr(config, "get") else {}
        services_cfg['autolearning'] = enabled
        if hasattr(config, "set"):
            config.set("services", services_cfg)
            if hasattr(config, "save_config"):
                config.save_config()

        # 3. ÉMISSION DU LOG DANS LA CONSOLE DE L'INTERFACE
        status_str = "activé" if enabled else "désactivé"
        log_event("learning", "Autolearning", f"Service 'Autolearning' {status_str} par l'utilisateur.")
        print(f"⚙️ Autolearning {status_str}")

    return jsonify({"status": "success", "service": service_id, "enabled": enabled})


# --- ROUTE STATUT AUTONOMIE (PING IHM) ---
@api_bp.route('/autonomy/status', methods=['GET'])
def get_autonomy_status():
    """Endpoint appelé par l'IHM/Node.js pour connaître le compte à rebours et l'état."""
    if global_scheduler is not None:
        is_enabled = getattr(global_scheduler, 'enabled', True)
        
        # SI DÉSACTIVÉ : On renvoie statut inactif
        if not is_enabled:
            return jsonify({
                "enabled": False,
                "is_executing": False,
                "idle_time_seconds": 0,
                "time_until_next_run": 0,
                "status_text": "Service désactivé"
            })

        if hasattr(global_scheduler, 'get_status'):
            status = global_scheduler.get_status()
            if isinstance(status, dict):
                status['enabled'] = True
                return jsonify(status)

    return jsonify({
        "enabled": False,
        "is_executing": False,
        "idle_time_seconds": 0,
        "time_until_next_run": 0,
        "status_text": "Démarrage du moteur..."
    })

# --- ROUTE STATUT MÉMOIRE (POPUP MAINTENANCE) ---
@api_bp.route('/memory/status', methods=['GET'])
def get_memory_status():
    status_path = resolve_path("../Maya_memory/Memory/status.txt")
    try:
        with open(status_path, "r", encoding="utf8") as f:
            return jsonify(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        return jsonify({"state": "idle", "detail": ""})

# --- GESTION DYNAMIQUE DE LLAMA-SERVER ---
llama_process = None
llama_process_lock = threading.Lock()

def restart_llama_server(context_size: int):
    global llama_process
    with llama_process_lock:
        print("🛑 Arrêt forcé des processus llama-server existants...")
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/IM", "llama-server.exe"], capture_output=True)
            else:
                subprocess.run(["pkill", "-f", "llama-server"], capture_output=True)
            time.sleep(1.5)
        except Exception as e:
            print(f"⚠️ Avertissement lors de la fermeture : {e}")

        raw_llama_bin = config.get("llama_bin", "llama/llama-server.exe")
        resolved_bin_path = resolve_path(raw_llama_bin)

        if sys.platform == "win32" and not resolved_bin_path.lower().endswith(".exe"):
            resolved_bin_path += ".exe"

        resolved_bin = (
            (resolved_bin_path if os.path.exists(resolved_bin_path) else None)
            or shutil.which(resolved_bin_path)
            or shutil.which(raw_llama_bin)
        )

        if not resolved_bin:
            error_msg = f"Exécutable introuvable au chemin : '{resolved_bin_path}'. Vérifiez 'llama_bin' dans config.json."
            print(f"❌ {error_msg}")
            return False, error_msg

        raw_model_path = config.get("llama_model_path", "model GGUF")
        target_model_path = resolve_path(raw_model_path)

        if os.path.isdir(target_model_path):
            gguf_files = []
            for root, _, files in os.walk(target_model_path):
                for f in files:
                    if f.lower().endswith(".gguf"):
                        gguf_files.append(os.path.join(root, f))
            
            if gguf_files:
                gguf_files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
                target_model_path = gguf_files[0]
                print(f"📦 Modèle sélectionné automatiquement : {os.path.basename(target_model_path)}")
                print(f"📂 Chemin résolu : {target_model_path}")
            else:
                print(f"⚠️ Aucun fichier .gguf trouvé dans le dossier : {target_model_path}")

        llama_port = config.get("llama_port", 8080)
        extra_args = config.get("llama_extra_args", [])

        cmd = [resolved_bin, "-c", str(context_size), "-np", "1", "--port", str(llama_port)]
        if os.path.isfile(target_model_path):
            cmd.extend(["-m", target_model_path])
        if extra_args and isinstance(extra_args, list):
            cmd.extend(extra_args)

        print(f"🚀 Démarrage de llama-server (1 slot, {context_size} tokens) : {' '.join(cmd)}")
        try:
            llama_process = subprocess.Popen(cmd)
            print(f"✅ llama-server démarré (PID: {llama_process.pid})")
            return True, f"llama-server redémarré avec {context_size} tokens sur 1 slot (PID {llama_process.pid})"
        except Exception as e:
            print(f"❌ Erreur lors du lancement de llama-server: {e}")
            return False, str(e)


@api_bp.route('/restart_llama', methods=['POST', 'OPTIONS'])
def handle_restart_llama():
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    data = request.get_json() or {}
    context_size = data.get("context_size") or data.get("contextSize")
    
    if not context_size:
        return jsonify({"error": "Paramètre context_size manquant"}), 400

    try:
        context_size = int(context_size)
    except ValueError:
        return jsonify({"error": "context_size doit être un nombre entier"}), 400

    if hasattr(config, "set"):
        config.set("maya_context_size", context_size)
    elif hasattr(config, "config") and isinstance(config.config, dict):
        config.config["maya_context_size"] = context_size
    elif hasattr(config, "config_data") and isinstance(config.config_data, dict):
        config.config_data["maya_context_size"] = context_size

    if hasattr(config, "save_config"):
        try:
            config.save_config()
        except Exception:
            pass

    success, msg = restart_llama_server(context_size)
    if success:
        return jsonify({"status": "ok", "message": msg, "context_size": context_size})
    else:
        return jsonify({"error": msg}), 500


app.register_blueprint(api_bp, url_prefix='/api')


@app.route('/')
def index():
    processed_capabilities = {}
    for name in plugin_manager.plugins:
        caps = plugin_manager.capabilities.get(name, [])
        processed_capabilities[name] = caps
        
        name_lower = name.lower()
        if name_lower not in processed_capabilities:
            processed_capabilities[name_lower] = caps

    return render_template(
        'index.html', 
        plugins=plugin_manager.plugins, 
        caps=processed_capabilities,
        getattr=getattr
    )


def start_autonomy_engine(config_obj, p_manager, idle_mgr):
    """Prépare et lance le Scheduler dans un thread séparé avec llama.cpp."""
    global global_scheduler

    async def run_loop():
        global global_scheduler
        
        goal_path = resolve_path(os.path.join("autonomy", "goals.json"))
        history_path = resolve_path(os.path.join("autonomy", "history.json"))
        
        goal_mgr = GoalManager(goal_path)
        history_mgr = HistoryManager(history_path) 
        
        llama_endpoint = config_obj.get("llama_cpp_endpoint", "http://localhost:8080/v1/chat/completions")
        base_url = llama_endpoint.rsplit("/chat/completions", 1)[0] if "/chat/completions" in llama_endpoint else llama_endpoint
        
        llm_client = LlamaCppClient(base_url=base_url)
        executor = Executor(hub_client=p_manager, llm_client=llm_client) 
        
        def priority_fn(goals, history):
            return goals[0] if goals else None

        class DummyIdle: 
            def is_idle(self, required_seconds=0): return True
            def idle_time(self): return 0

        active_idle_mgr = idle_mgr if idle_mgr is not None else DummyIdle()

        # Récupération de l'état souhaité dans la config (Active par défaut si non spécifié)
        services_cfg = config_obj.get("services", {}) if hasattr(config_obj, "get") else {}
        initial_enabled = services_cfg.get("autolearning", True)

        global_scheduler = Scheduler(
            idle_mgr=active_idle_mgr,
            goal_mgr=goal_mgr,
            priority_fn=priority_fn,
            executor=executor,
            history_mgr=history_mgr,
            config=config_obj 
        )
        global_scheduler.enabled = initial_enabled

        try:
            import core.api
            core.api.global_scheduler = global_scheduler
        except Exception:
            pass

        log_event("learning", "Autolearning", f"Moteur d'apprentissage démarré ({'Activé' if initial_enabled else 'Désactivé'}).")

        await global_scheduler.run()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_loop())


def main():
    logger = setup_logger("MayaHub")
    logger.info("--- DÉMARRAGE DU MAYA HUB 2 (LLAMA.CPP MODE) ---")
    
    try:
        autonomy_thread = threading.Thread(
            target=start_autonomy_engine, 
            args=(config, plugin_manager, idle_mgr_instance), 
            daemon=True
        )
        autonomy_thread.start()
        logger.info("🚀 Thread d'autonomie (Scheduler - llama.cpp) lancé en arrière-plan.")
    except Exception as e:
        logger.error(f"❌ Impossible de démarrer le Scheduler : {e}")

    print("\n" + "="*50)
    print("🌟 MAYA HUB 2 (LLAMA.CPP) IS ALIVE! 🌟")
    print("🌐 Interface: http://127.0.0.1:5005")
    print("🤖 Status: Online & Connected to llama.cpp")
    print("="*50 + "\n")

    try:
        app.run(host='127.0.0.1', port=5005, debug=True, use_reloader=False)
    except Exception as e:
        logger.error(f"Erreur critique au démarrage : {e}")
        print(f"❌ Le Hub a crashé ! Erreur : {e}")


if __name__ == "__main__":
    main()