# 🔌 Spécifications du Hub Central & Architecture MCP — Maya

## 📐 Philosophie & raison d'être du Hub

Le **Hub Central** est le chef d'orchestre opérationnel de Maya.

Il est né d'un constat simple : au fur et à mesure que l'assistant s'enrichit en fonctionnalités et en outils, la gestion directe de chaque intégration par l'interface ou le LLM devient complexe et difficile à maintenir.

Le Hub fournit donc une couche intermédiaire centralisée entre Maya et ses différents outils.

Cette architecture permet de conserver une interface principale relativement indépendante des outils qu'elle utilise.

---

# 🎯 Objectifs principaux

## 1. Architecture Plug & Play

Le Hub est conçu autour d'une architecture modulaire permettant :

* d'ajouter un outil sans modifier le pipeline principal ;
* de tester un plugin indépendamment ;
* d'activer ou désactiver un module ;
* de retirer un plugin sans modifier l'interface principale ;
* de centraliser la découverte et l'exécution des outils.

L'objectif est que l'ajout d'une nouvelle compétence ne nécessite pas de modifier l'ensemble de Maya.

---

## 2. Centralisation des outils

Le Hub centralise les interactions entre Maya et les différents outils disponibles.

L'interface Maya n'a donc pas besoin de connaître l'implémentation interne de chaque plugin.

```text
                ┌─────────────────────┐
                │      Maya UI        │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │      Maya Hub       │
                │        MCP          │
                └──────────┬──────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
        DeepSearch    FileSystem     MEMORY
```

Cette séparation permet notamment de faire évoluer les outils sans devoir réécrire l'interface.

---

## 3. Interface Web de supervision

Le Hub fournit également une interface Web permettant de visualiser et de contrôler son fonctionnement.

### Caractéristiques

* Dashboard Flask
* Interface Glassmorphism / Cyberpunk Neon
* Visualisation des plugins
* Visualisation de leurs capacités
* Gestion de l'état des plugins
* Gestion des services associés
* Accès aux fonctions de supervision du Hub

---

# 🏗️ Architecture du Hub

```text
┌────────────────────────┐
│      Moteur LLM        │
└───────────┬────────────┘
            │
       Appel d'outil / MCP
            │
            ▼
┌────────────────────────┐
│    HUB CENTRAL MCP     │◄───────────────┐
│   Routeur & Gestion    │                │
└───────────┬────────────┘                │
            │                             │
    ┌───────┼───────────────┐             │
    ▼       ▼               ▼             │
┌────────┐ ┌────────────┐ ┌────────────┐ │
│Deep-   │ │ FileSystem │ │  MEMORY    │ │
│Search  │ │  Fichiers  │ │Compétences │ │
└────────┘ └────────────┘ └────────────┘ │
    │            │              │         │
    └────────────┼──────────────┘         │
                 ▼                        │
        ┌────────────────┐                │
        │  Auto-Learning │                │
        │   Scheduler    │                │
        └────────────────┘                │
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │   Web Dashboard      │
                              │       Flask          │
                              └──────────────────────┘
```

Le Hub constitue ainsi la couche centrale entre le moteur de Maya et les fonctionnalités externes.

---

# 🎛️ Dashboard Web

<img width="1032" height="689" alt="Capture d&#39;écran 2026-08-14 102206" src="https://github.com/user-attachments/assets/0dd4482d-45aa-4ade-9628-99dc973f4da1" />


Le Hub intègre un serveur Flask permettant de visualiser et contrôler le système.

## Fonctionnalités

### 📊 Visualisation dynamique

Le Dashboard permet notamment :

* la détection des plugins disponibles ;
* l'affichage de leurs informations ;
* l'affichage de leurs capacités ;
* la visualisation de l'état des différents composants ;
* le timer de l'Auto-Learning en temps réel.

---

## 🔄 Activation / Désactivation

Les modules peuvent être activés ou désactivés depuis l'interface du Hub.

Cela permet de contrôler notamment :

* les plugins MCP ;
* certains services du système ;
* les fonctions d'autonomie lorsque celles-ci sont disponibles.

L'objectif est de limiter les manipulations manuelles dans les fichiers de configuration.

---

## 🎨 Interface

Le Dashboard utilise actuellement une interface orientée supervision avec :

* Glassmorphism ;
* éléments Cyberpunk Neon ;
* cartes interactives ;
* indicateurs d'état ;
* contrôles des différents modules.

---

## 🌐 API

Le Hub expose une API permettant à l'interface et aux autres composants de communiquer avec lui.

Les endpoints comprennent notamment :

* `/api/toggle_plugin`
* `/api/toggle_service`

Cette API constitue également une couche d'abstraction entre l'interface utilisateur et le fonctionnement interne du Hub.

---

# 🛠️ Modules opérationnels

Le Hub permet d'intégrer plusieurs types d'outils sous forme de plugins indépendants.

---

## 🔍 Module DeepSearch — ResearchPlugin

**Statut :** ✅ Fonctionnel & optimisé

### Principe

Le module DeepSearch permet à Maya d'effectuer des recherches Web et de produire une synthèse structurée des informations collectées.

### Traitement

Il peut notamment :

* lancer plusieurs recherches ;
* effectuer des recherches secondaires ;
* croiser différentes sources ;
* analyser les informations récupérées ;
* produire une synthèse finale.

### Utilisation

Le module peut être appelé :

* directement par l'utilisateur ;
* par les systèmes autonomes de Maya (Auto-Learning) lorsque ceux-ci sont activés.

---

## 📁 FileSystemPlugin

**Statut :** ✅ Fonctionnel & validé

### Principe

Le FileSystemPlugin permet à Maya d'interagir avec le système de fichiers de l'utilisateur de manière sécurisée et intelligente.

### Capacités

* `write_file` — Créer ou écrire dans un fichier
* `read_file` — Lire le contenu d'un fichier
* `move_file` — Déplacer ou renommer un fichier
* `list_directory` — Lister le contenu d'un dossier
* `delete_file` — Supprimer un fichier

### Particularités

* Résolution intelligente vers le **vrai Bureau de l'utilisateur** (`C:\Users\<User>\Desktop`)
* Parsing universel des paramètres : chaînes, `kwargs`, JSON et alias de clés

---

## 🧠 Plugin MEMORY

**Statut :** ✅ Fonctionnel

> ⚠️ Ce plugin est totalement indépendant de la mémoire de personnalité de Maya (Core / Journal).

Le Plugin MEMORY est destiné à conserver des informations exploitables par les compétences et outils de Maya.

Il peut notamment stocker :

* des compétences ;
* des procédures ;
* des connaissances techniques ;
* des informations validées issues de recherches ;
* des résultats destinés à être réutilisés ultérieurement.

Cette mémoire est distincte du système de journal/personnalité de Maya.

---

# ⚙️ Auto-Learning & contrôle d'activité

**Statut :** ✅ Fonctionnel & optimisé

Le système d'Auto-Learning permet à Maya d'effectuer automatiquement des missions de recherche et de veille afin d'enrichir le **Plugin MEMORY**.

Pour éviter les exécutions inutiles et la surconsommation de ressources, le système est régulé par **l'activité réelle de l'utilisateur** et supervisé en temps réel.

---

# 🧠 Logique de planification & Timer

## ⏱️ Vérification des 20 minutes & Timer visible

* **Timer temps réel :** un compte à rebours dynamique est visible directement sur le Dashboard Web du Hub.
* **Condition de déclenchement :** à l'échéance des 20 minutes, le Scheduler vérifie si un échange a eu lieu entre l'utilisateur et Maya durant cet intervalle.
* **Sécurité :** si aucun échange n'a été détecté dans les 20 dernières minutes, le cycle est reporté afin de ne pas lancer de recherches à vide.

---

## 📅 Limite : une exécution par jour et par sujet

Chaque sujet présent dans `goals.json` est traité au maximum **une fois par jour**.

Si un sujet a déjà été exécuté pendant la journée, le Scheduler passe automatiquement au sujet suivant via une rotation **Round Robin**.

---

## 🔄 Rotation Round Robin

Le Scheduler parcourt les objectifs selon leur ordre de priorité.

Il sélectionne le premier sujet qui est :

* actif ;
* disponible ;
* non exécuté pendant la journée.

Lorsque tous les sujets ont été traités :

* aucune nouvelle recherche n'est lancée ;
* le Scheduler attend le jour suivant.

---

# 🧹 Filtre sémantique

Avant qu'une nouvelle information soit sauvegardée, une seconde analyse IA compare la synthèse obtenue avec les connaissances déjà présentes dans le Plugin MEMORY.

Cette étape permet d'éviter l'accumulation d'informations redondantes.

### Cas 1 — Information déjà connue

```text
NO_NEW_INFO
```

➡️ Aucune sauvegarde n'est effectuée.

### Cas 2 — Nouvelle information pertinente

1. La synthèse est validée.
2. L'information est préparée pour archivage.
3. Elle est enregistrée dans le **Plugin MEMORY**.

---

# 🔗 Relation avec l'interface Maya

L'interface propriétaire ne communique pas directement avec chaque plugin.

Elle utilise le Hub comme point central de communication.

```text
┌──────────────────────────────┐
│        Interface Maya        │
│                              │
│  Chat / VRM / TTS / Status   │
└───────────────┬──────────────┘
                │
                ▼
┌──────────────────────────────┐
│          Maya Hub            │
│                              │
│     Routage des outils       │
└───────────────┬──────────────┘
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
 DeepSearch  FileSystem  MEMORY
                │
                ▼
           Auto-Learning
```

Cette architecture permet à l'interface de rester indépendante de la liste des plugins disponibles.

---

# 🧩 Architecture des plugins

Chaque plugin constitue un module indépendant du Hub.

Le **Plugin Manager** est responsable de la découverte et de la gestion des plugins disponibles.

```text
Maya Hub
   │
   ▼
Plugin Manager
   │
   ├── DeepSearch (ResearchPlugin)
   ├── FileSystemPlugin
   ├── MEMORY
   └── Auto-Learning (Scheduler)
```

---

# 🛡️ Principe d'isolation

Le Hub a été conçu afin que les outils restent isolés du cœur de Maya.

Une erreur ou une modification dans un plugin ne doit pas nécessiter de modifier :

* l'interface utilisateur ;
* le système VRM ;
* le système vocal ;
* l'historique des conversations ;
* le moteur LLM.

Cette isolation constitue l'un des principaux avantages de l'architecture actuelle.

---

# 📊 État actuel du Hub

| Composant                        | État             |
| -------------------------------- | ---------------- |
| Hub Central                      | ✅ Fonctionnel    |
| Architecture Async (HTTPX)       | ✅ Opérationnelle |
| Parsing universel des paramètres | ✅ Opérationnel   |
| Plugin Manager                   | ✅ Fonctionnel    |
| API Hub                          | ✅ Fonctionnelle  |
| Dashboard Web                    | ✅ Fonctionnel    |
| Connexion avec l'interface Maya  | ✅ Fonctionnelle  |
| Indicateur de connexion (UI)     | ✅ Fonctionnel    |
| DeepSearch (ResearchPlugin)      | ✅ Fonctionnel    |
| FileSystemPlugin                 | ✅ Validé         |
| Plugin MEMORY                    | ✅ Fonctionnel    |
| Auto-Learning                    | ✅ Fonctionnel    |

---

# 🚀 Philosophie du Hub

Le Hub n'a pas vocation à devenir un second cœur de Maya.

Son rôle est de fournir une **couche d'abstraction stable entre Maya et ses outils**.

Cela permet de faire évoluer séparément :

* l'interface ;
* le LLM ;
* la mémoire ;
* les outils ;
* les systèmes d'autonomie ;
* les services externes.

Le Hub devient ainsi le point de contrôle central de l'écosystème Maya.

> **Maya réfléchit.**
> **Le Hub lui donne les moyens d'agir.**
