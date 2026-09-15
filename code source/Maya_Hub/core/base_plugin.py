from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BasePlugin(ABC):
    """
    Contrat principal pour tous les plugins du Maya Hub.

    Chaque plugin doit :
    - avoir un identifiant unique
    - avoir un nom affichable
    - décrire son rôle
    - déclarer ses capacités
    - exposer ses outils pour les IA
    - implémenter la fonction run()
    """


    # --- Identité interne du plugin ---
    #
    # Identifiant stable utilisé par le Hub et les IA.
    #
    # Exemple :
    # "memory"
    # "lights"
    # "creative"
    #
    # Ne doit pas changer une fois publié.
    id: str = ""


    # --- Nom affiché à l'utilisateur ---
    #
    # Exemple :
    # "Long Term Memory"
    # "WiZ Lights"
    #
    name: str = ""


    # --- Description du rôle du plugin ---
    #
    # Utilisée par les interfaces IA
    # pour comprendre le module.
    #
    description: str = ""



    # --- Liste simple des actions disponibles pour le Hub ---
    #
    # Exemple :
    #
    # [
    #   "save_memory",
    #   "query_memory"
    # ]
    #
    capabilities: List[str] = []



    # --- Description détaillée des outils pour les IA ---
    #
    # Permet à AnythingLLM/OpenLLMVTuber
    # de comprendre :
    #
    # - ce que fait l'outil
    # - quelles informations envoyer
    #
    # Exemple :
    #
    # tools = {
    #
    #     "save_memory": {
    #
    #         "description":
    #             "Sauvegarder un souvenir",
    #
    #         "parameters": {
    #
    #             "content":
    #                 "Texte du souvenir",
    #
    #             "importance":
    #                 "Importance de 1 à 5"
    #         }
    #     }
    # }
    #
    tools: Dict[str, Dict[str, Any]] = {}



    @abstractmethod
    def run(
        self,
        action: str,
        params: Dict[str, Any]
    ) -> Any:
        """
        Point d'entrée unique d'exécution.

        Le Hub appelle cette fonction pour demander
        une action à un plugin.

        :param action:
            Nom de l'action à effectuer.

        :param params:
            Paramètres nécessaires à l'action.

        :return:
            Résultat de l'exécution.
        """

        pass