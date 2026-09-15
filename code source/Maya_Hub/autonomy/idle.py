import time

class IdleManager:
    def __init__(self):
        self.last_activity = time.time()
        self.busy = False

    def update_activity(self):
        # Réinitialise le compteur d'activité lors d'une interaction utilisateur
        self.last_activity = time.time()

    def set_busy(self, value: bool):
        # Définit le verrou d'occupation de Maya
        self.busy = value

    def idle_time(self) -> float:
        # Retourne la durée d'inactivité en secondes
        return time.time() - self.last_activity

    def is_idle(self, required_seconds: float) -> bool:
        # Vérifie si Maya est inactive depuis la durée minimale exigée
        if self.busy:
            return False
        return self.idle_time() >= required_seconds
