# 🔌 Spécifications du Hub Central & Architecture MCP — Maya

## 📐 Philosophie & Raison d'Être du Hub

Le **Hub Central** est le chef d'orchestre opérationnel de Maya. Il est né d'un constat simple : au fur et à mesure que l'assistant s'enrichit en fonctionnalités (recherche Steam, contrôle des lumières WiZ, moteurs créatifs, veille web), la gestion directe des outils par le LLM devient complexe et instable.

### Les objectifs clés du Hub :
1. **Architecture "Plug & Play" :** Pouvoir ajouter, tester, désactiver ou retirer un outil MCP en quelques secondes sans devoir recoder le pipeline principal.
2. **Standardisation :** Unifier la façon dont le LLM (Gemma 4) interagit avec le monde extérieur via la norme MCP (*Model Context Protocol*).
3. **Exécution transparente :** Le Hub s'initialise et démarre automatiquement au lancement du projet en tâche de fond.

---

## 🏗️ Architecture du Hub & Flux d'Exécution

```text
                 ┌────────────────────────┐
                 │  Moteur LLM (Gemma 4)  │
                 └───────────┬────────────┘
                             │ (Appel d'outil / Intent)
                             ▼
                 ┌────────────────────────┐
                 │    HUB CENTRAL MCP     │
                 │  (Routeur & Gestion)   │
                 └───────────┬────────────┘
                             │
  ┌─────────────────┬────────┴───────────┬─────────────────┐
  ▼                 ▼                    ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Domotique   │  │  DeepSearch  │  │ MCP Créatif  │  │    Plugin    │
│  (Lumières)  │  │ (R&D / Web)  │  │  (Critique)  │  │    MEMORY    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 🛠️ Modules & Outils Actuels du Hub

### 1. 💡 Module Domotique — Contrôle WiZ Local
* **Scan Réseau Autonome :** Le module scanne le réseau Wi-Fi local pour détecter dynamiquement les ampoules connectées WiZ allumées et récupérer leurs adresses IP.
* **Fonctionnalités :** Permet à Maya d'allumer, éteindre ou changer la couleur et l'ambiance des lumières sur simple demande vocale ou textuelle.

### 2. 🎨 Module MCP Créatif — Système de Boucle Critique à 3 Prompts
Pour éviter d'obtenir des résultats génériques ou de mauvaise qualité, le MCP Créatif utilise un pipeline d'auto-correction en 3 étapes (exemple pour la création musicale) :
* **Prompt 1 (Génération) :** Génération de plusieurs propositions brutes basées sur le thème et le style demandés.
* **Prompt 2 (Critique) :** Le LLM bascule dans le rôle d'un critique exigeant pour analyser et noter les différentes propositions.
* **Prompt 3 (Sélection & Refactor) :** Un dernier filtre analyse les critiques, retient ou affine la meilleure proposition et délivre le résultat final.

### 3. 🔍 Module DeepSearch (R&D — En cours de développement)
* **Principe :** Effectue des recherches web approfondies en arrière-plan.
* **Traitement Invisible :** Les résultats bruts de recherche sont transmis au LLM de manière transparente pour l'utilisateur. Le LLM en extrait une synthèse claire qu'il renvoie au Hub pour archivage dans le plugin MEMORY.

### 4. 🧠 Plugin MEMORY du Hub (Compétences & Savoir-Faire)
> ⚠️ **Distinct de la mémoire de personnalité de Maya :** Ce plugin stocke exclusivement le savoir-faire applicatif, les procédures et les données issues des recherches web.

* **Mode Manuel :** L'utilisateur peut demander à Maya d'enregistrer explicitement une consigne, une procédure ou une information clé dans ce module.
* **Mode Autonome :** Alimenté automatiquement par les recherches web du module DeepSearch et le système d'apprentissage autonome.

---

## 🧪 R&D : Le Système d'Apprentissage Autonome en Temps Mort (Idle Auto-Learning)

Le module d'apprentissage autonome tire parti des périodes d'inactivité de l'utilisateur pour enrichir continuellement les connaissances et les compétences de Maya sans impacter les performances du PC.

```text
  [ Inactivité utilisateur (20 min) ]
                 │
                 ▼
   [ Le Hub MCP prend la main ] ──► [ Vérification : Max 3 recherches/jour ]
                 │
                 ▼
   [ Sélecteur de Sujets par Pondération ]
   (Actu IA, Actu Cuisine, Nouveaux Outils, Analyse du ton/Naturalité)
                 │
                 ▼
   [ Exécution de la recherche (DeepSearch) ] (Invisible)
                 │
                 ▼
   [ Synthèse & Archivage ] ──► Stockage dans le plugin MEMORY du Hub
```

### Déroulement & Règles d'Inférence :

* **Détection de l'Inactivité (Watchdog) :** Au lancement du Hub, un compte à rebours est initialisé. Si aucune interaction (vocale ou textuelle) n'est détectée pendant 20 minutes, le système bascule en mode *Background Processing*.
* **Quota de Sécurité :** Le système est bridé à **3 sessions d'apprentissage maximum par jour** pour préserver la bande passante et la charge système.
* **Distribution des Sujets par Pondération (Weight System) :**  
  Un algorithme de poids scrute l'historique des recherches passées pour équilibrer les axes d'apprentissage et éviter la répétition :
  * 📰 Actualités & Veille IA
  * 🍳 Cuisine & Recettes
  * 🛠️ Découverte de nouveaux outils & compétences (pour auto-proposer de nouvelles fonctions)
  * 💬 Analyse des conversations passées (pour affiner le ton et rendre les réponses de plus en plus naturelles)
* **Exécution & Stockage Silencieux :** Le LLM effectue la recherche via DeepSearch, synthétise l'information pertinente et l'enregistre discrètement dans le plugin MEMORY du Hub. Maya acquiert ainsi de nouveaux savoirs de manière autonome.
