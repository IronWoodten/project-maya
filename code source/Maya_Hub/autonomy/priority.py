import random

def choose_goal(goals: list, history: list) -> dict:
    """
    Sélectionne l'objectif le plus vieux ('last_checked' le plus ancien).
    En cas d'égalité de date (très rare), prend la priorité la plus haute.
    Cela permet un Round-Robin parfait qui respecte les priorités sans 
    bloquer sur un seul sujet.
    Prend en charge aussi bien les dictionnaires que les chaînes de texte brutes.
    """
    if not goals:
        return None

    def sort_key(g):
        if isinstance(g, dict):
             date_str = g.get("last_checked", "1970-01-01T00:00:00")
             priority = g.get("priority", 0)
        else:
            date_str = "1970-01-01T00:00:00"
            priority = 0
        return (date_str, -priority)

    sorted_goals = sorted(goals, key=sort_key)
    return sorted_goals[0] if sorted_goals else None
