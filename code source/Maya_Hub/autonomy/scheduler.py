import asyncio
from datetime import date, datetime
import json
import logging
from pathlib import Path
import time

logger = logging.getLogger("MayaAutonomy")

class Scheduler:
    def __init__(self, idle_mgr, goal_mgr, priority_fn, executor, history_mgr, config: dict):
        self.idle_mgr = idle_mgr
        self.goal_mgr = goal_mgr
        self.priority_fn = priority_fn
        self.executor = executor
        self.history_mgr = history_mgr
        self.config = config if isinstance(config, dict) else {}
        
        self._running = False
        self.last_run_timestamp = time.time()
        self.is_executing = False
        self.current_status = "Inactif"
        self.enabled = True  # Peut être modifié dynamiquement via /api/toggle_service

    def get_status(self) -> dict:
        """Retourne l'état actuel pour l'IHM / Node.js (Ping)"""
        interval = self.config.get("check_interval", 1200)
        elapsed = time.time() - self.last_run_timestamp
        time_remaining = max(0, int(interval - elapsed))

        return {
            "enabled": self.enabled,
            "is_executing": self.is_executing,
            "idle_time_seconds": int(self.idle_mgr.idle_time()),
            "time_until_next_run": time_remaining,
            "status_text": self.current_status
        }

    async def run(self):
        """Boucle principale ultra-légère (Tick toutes les 5 secondes)."""
        self._running = True
        logger.info("🚀 [SCHEDULER] Démarrage de l'apprentissage autonome intelligent.")

        while self._running:
            try:
                # --- VÉRIFICATION DU SWITCH ON/OFF ---
                # Si le service est désactivé, on ne fait RIEN (ni décompte, ni exécution)
                # et on ne fait avancer aucun timer, pour repartir "propre" à la réactivation.
                if not self.enabled:
                    self.current_status = "Service désactivé"
                    self.is_executing = False
                    await asyncio.sleep(5)
                    continue

                interval = self.config.get("check_interval", 1200) # 20 minutes par défaut
                min_idle = self.config.get("min_idle_seconds", 300) # 5 min d'inactivité requise
                
                time_since_last_run = time.time() - self.last_run_timestamp

                # Si le délai de 20 min est écoulé
                if time_since_last_run >= interval:
                    # ON VÉRIFIE SI USER/MAYA EST IDLE !
                    if self.idle_mgr.is_idle(min_idle):
                        self.is_executing = True
                        self.current_status = "Recherche autonome en cours..."
                        
                        # Récupération de la liste brute des objectifs
                        if hasattr(self.goal_mgr, 'get_goals'):
                            goals_list = self.goal_mgr.get_goals()
                        elif hasattr(self.goal_mgr, 'goals'):
                            goals_list = self.goal_mgr.goals
                        elif isinstance(self.goal_mgr, list):
                            goals_list = self.goal_mgr
                        else:
                            goals_list = []

                        # Récupération de la liste d'historique
                        if hasattr(self.history_mgr, 'get_history'):
                            history_list = self.history_mgr.get_history()
                        elif hasattr(self.history_mgr, 'get_entries'):
                            history_list = self.history_mgr.get_entries()
                        elif hasattr(self.history_mgr, 'history'):
                            history_list = self.history_mgr.history
                        elif isinstance(self.history_mgr, list):
                            history_list = self.history_mgr
                        else:
                            history_list = []

                        # 1. Récupération de l'objectif prioritaire
                        goal = None
                        if hasattr(self.priority_fn, 'get_next_goal'):
                            goal = self.priority_fn.get_next_goal(goals_list, history_list)
                        elif callable(self.priority_fn):
                            goal = self.priority_fn(goals_list, history_list)
                        elif hasattr(self.goal_mgr, 'get_next_goal'):
                            goal = self.goal_mgr.get_next_goal()

                        if goal:
                            # Formatage automatique si goal est une chaîne brute
                            goal_payload = {"id": goal, "name": goal, "prompt": goal} if isinstance(goal, str) else goal

                            # 2. Exécution via la méthode execute() de self.executor
                            if asyncio.iscoroutinefunction(self.executor.execute):
                                result = await self.executor.execute(goal_payload, history_manager=self.history_mgr)
                            else:
                                result = self.executor.execute(goal_payload, history_manager=self.history_mgr)
        
                            # 3. Enregistrement dans l'historique
                            if self.history_mgr and hasattr(self.history_mgr, 'add_entry'):
                                goal_id = goal_payload.get('id', str(goal))
                                goal_name = goal_payload.get('name', str(goal))
                                self.history_mgr.add_entry(goal_id, goal_name, result)
                        else:
                            logger.info("ℹ️ [SCHEDULER] Aucun objectif à exécuter.")

                        self.last_run_timestamp = time.time()
                        self.is_executing = False
                        self.current_status = "En attente"
                    else:
                        self.current_status = f"En attente d'inactivité utilisateur ({int(self.idle_mgr.idle_time())}s/{min_idle}s)"
                else:
                    self.current_status = "En attente du prochain cycle"

            except Exception as e:
                logger.error(f"❌ [SCHEDULER] Erreur boucle : {e}", exc_info=True)
                self.is_executing = False

            # Tick de 5 secondes : ne consomme aucun CPU et permet un arrêt rapide
            await asyncio.sleep(5)

    def stop(self):
        self._running = False