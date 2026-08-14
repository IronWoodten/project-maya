# 🔌 Spécifications du Hub Central & Architecture MCP — Maya

## 📐 Philosophie & Raison d'Être du Hub

Le **Hub Central** est le chef d'orchestre opérationnel de Maya.

Il est né d'un constat simple : au fur et à mesure que l'assistant s'enrichit en fonctionnalités et en outils, la gestion directe de chaque intégration par l'interface ou le LLM devient complexe et difficile à maintenir.

Le Hub fournit donc une couche intermédiaire centralisée entre Maya et ses différents outils.

Cette architecture permet de conserver une interface principale relativement indépendante des outils qu'elle utilise.

---

# 🎯 Objectifs principaux

## 1. Architecture Plug & Play

Le Hub est conçu autour d'une architecture modulaire permettant :

- d'ajouter un outil sans modifier le pipeline principal ;
- de tester un plugin indépendamment ;
- d'activer ou désactiver un module ;
- de retirer un plugin sans modifier l'interface principale ;
- de centraliser la découverte et l'exécution des outils.

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
           Plugin 1      Plugin 2      Plugin 3
```

Cette séparation permet notamment de faire évoluer les outils sans devoir réécrire l'interface.

---

## 3. Interface Web de supervision

Le Hub fournit également une interface Web permettant de visualiser et de contrôler son fonctionnement.

### Caractéristiques

- Dashboard Flask
- Interface Glassmorphism / Cyberpunk Neon
- Visualisation des plugins
- Visualisation de leurs capacités
- Gestion de l'état des plugins
- Gestion des services associés
- Accès aux fonctions de supervision du Hub

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
             ┌────────────────┼────────────────┐            │
             ▼                ▼                ▼            │
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
      │  Domotique   │ │  DeepSearch  │ │ MCP Créatif  │    │
      │   WiZ        │ │  Recherche   │ │   Créatif    │    │
      └──────────────┘ └──────────────┘ └──────────────┘    │
             │                │                │             │
             └────────────────┼────────────────┘             │
                              ▼                              │
                     ┌────────────────┐                      │
                     │ Plugin MEMORY  │                      │
                     │ Compétences    │                      │
                     └────────────────┘                      │
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

Le Hub intègre un serveur Flask permettant de visualiser et contrôler le système.

## Fonctionnalités

### 📊 Visualisation dynamique

Le Dashboard permet notamment :

- la détection des plugins disponibles ;
- l'affichage de leurs informations ;
- l'affichage de leurs capacités ;
- la visualisation de l'état des différents composants.

---

## 🔄 Activation / Désactivation

Les modules peuvent être activés ou désactivés depuis l'interface du Hub.

Cela permet de contrôler notamment :

- les plugins MCP ;
- certains services du système ;
- les fonctions d'autonomie lorsque celles-ci sont disponibles.

L'objectif est de limiter les manipulations manuelles dans les fichiers de configuration.

---

## 🎨 Interface

Le Dashboard utilise actuellement une interface orientée supervision avec :

- Glassmorphism ;
- éléments Cyberpunk Neon ;
- cartes interactives ;
- indicateurs d'état ;
- contrôles des différents modules.

---

## 🌐 API

Le Hub expose une API permettant à l'interface et aux autres composants de communiquer avec lui.

Les endpoints comprennent notamment :

- `/api/toggle_plugin`
- `/api/toggle_service`

Cette API constitue également une couche d'abstraction entre l'interface utilisateur et le fonctionnement interne du Hub.

---

# 🛠️ Modules Opérationnels

Le Hub permet d'intégrer plusieurs types d'outils sous forme de plugins indépendants.

---

## 💡 Module Domotique — WiZ

**Statut :** ✅ Fonctionnel

### Fonctionnement

Le module permet de communiquer avec les éclairages WiZ présents sur le réseau local.

Il peut notamment :

- détecter les périphériques disponibles ;
- récupérer leurs informations réseau ;
- envoyer les commandes aux éclairages.

### Fonctionnalités

- Allumer les lumières
- Éteindre les lumières
- Modifier les couleurs
- Changer l'ambiance
- Contrôler les lumières depuis Maya

Le module est isolé du reste de l'interface et communique avec Maya via le Hub.

---

## 🎨 Module MCP Créatif

**Statut :** ✅ Fonctionnel

Le module créatif permet à Maya d'utiliser une approche en plusieurs étapes afin d'améliorer la qualité des productions.

### 1. Génération

Plusieurs propositions peuvent être produites en fonction :

- du thème ;
- du style demandé ;
- des contraintes éventuelles.

### 2. Critique

Une seconde étape analyse les propositions générées.

Le système peut notamment :

- identifier les points faibles ;
- comparer les différentes propositions ;
- attribuer une évaluation.

### 3. Sélection & Refactor

Une dernière étape permet :

- de sélectionner la proposition la plus pertinente ;
- de l'améliorer si nécessaire ;
- de retourner uniquement le résultat final.

Cette architecture permet de séparer la génération de la phase d'évaluation et d'amélioration.

---

## 🔍 Module DeepSearch

**Statut :** ✅ Fonctionnel

### Principe

Le module DeepSearch permet à Maya d'effectuer des recherches Web et de produire une synthèse structurée des informations collectées.

### Traitement

Il peut notamment :

- lancer plusieurs recherches ;
- effectuer des recherches secondaires ;
- croiser différentes sources ;
- analyser les informations récupérées ;
- produire une synthèse finale.

### Utilisation

Le module peut être appelé :

- directement par l'utilisateur ;
- par les systèmes autonomes de Maya lorsque ceux-ci sont activés.

---

## 🧠 Plugin MEMORY

**Statut :** ✅ Fonctionnel

> ⚠️ Ce plugin est totalement indépendant de la mémoire de personnalité de Maya.

Le Plugin MEMORY est destiné à conserver des informations exploitables par les compétences et outils de Maya.

Il peut notamment stocker :

- des compétences ;
- des procédures ;
- des connaissances techniques ;
- des informations validées issues de recherches ;
- des résultats destinés à être réutilisés ultérieurement.

Cette mémoire est distincte du système de journal/personnalité de Maya.

---

# ⚙️ Auto-Learning & Contrôle d'Activité

**Statut :** ✅ Fonctionnel & Optimisé

Le système d'Auto-Learning permet à Maya d'effectuer automatiquement des missions de recherche et de veille afin d'enrichir le **Plugin MEMORY**.

Pour éviter les exécutions inutiles et la surconsommation de ressources, le système est désormais régulé par **l'activité réelle de l'utilisateur** et supervisé en temps réel.

---

# 🧠 Logique de Planification & Timer

## ⏱️ Vérification des 20 Minutes & Timer Visible

- **Timer Temps Réel :** Un compte à rebours dynamique est visible directement sur le Dashboard Web du Hub.
- **Condition de Déclenchement :** À l'échéance des 20 minutes, le Scheduler vérifie si un échange a eu lieu entre l'utilisateur et Maya durant cet intervalle.
- **Sécurité :** Si aucun échange n'a été détecté dans les 20 dernières minutes, le cycle est reporté pour ne pas lancer de recherches à vide.

---

## 📅 Limite : Une exécution par jour et par sujet

Chaque sujet présent dans `goals.json` est traité au maximum **une fois par jour**. Si un sujet a déjà été exécuté pendant la journée, le Scheduler passe automatiquement au sujet suivant via une rotation **Round Robin**.

Si un sujet a déjà été exécuté pendant la journée :

➡️ le Scheduler passe automatiquement au sujet suivant.

Cette limite évite de répéter inutilement les mêmes recherches.

---

## 🔄 Rotation Round Robin

Le Scheduler parcourt les objectifs selon leur ordre de priorité.

Il sélectionne le premier sujet qui est :

- actif ;
- disponible ;
- non exécuté pendant la journée.

Lorsque tous les sujets ont été traités :

- aucune nouvelle recherche n'est lancée ;
- le Scheduler attend le jour suivant.

---

# 🧹 Filtre Sémantique

Avant qu'une nouvelle information soit sauvegardée, une seconde analyse IA compare la synthèse obtenue avec les connaissances déjà présentes dans le Plugin MEMORY.

Cette étape permet d'éviter l'accumulation d'informations redondantes.

---

## Cas 1 — Information déjà connue

Si l'information est considérée comme déjà présente :

```text
NO_NEW_INFO
```

➡️ aucune sauvegarde n'est effectuée.

---

## Cas 2 — Nouvelle information pertinente

Si une information nouvelle et pertinente est détectée :

1. la synthèse est validée ;
2. l'information est préparée pour archivage ;
3. elle est enregistrée dans le **Plugin MEMORY**.

```text
Nouvelle recherche
       │
       ▼
   Synthèse IA
       │
       ▼
Comparaison avec MEMORY
       │
   ┌───┴────┐
   ▼        ▼
Connue    Nouvelle
   │        │
   ▼        ▼
 Ignorer   Valider
            │
            ▼
       MEMORY / Save
```

---

# 🔗 Relation avec l'Interface Maya

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
│      Routage des outils      │
└───────────────┬──────────────┘
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
    WiZ     DeepSearch   Créatif
      │         │         │
      └─────────┼─────────┘
                ▼
             MEMORY
```

Cette architecture permet à l'interface de rester indépendante de la liste des plugins disponibles.

L'ajout d'un nouveau plugin ne nécessite donc pas de modifier le fonctionnement fondamental de l'interface.

---

# 🧩 Architecture des Plugins

Chaque plugin constitue un module indépendant du Hub.

Le Plugin Manager est responsable de la découverte et de la gestion des plugins disponibles.

Le principe général est :

```text
Maya Hub
   │
   ▼
Plugin Manager
   │
   ├── Plugin A
   ├── Plugin B
   ├── Plugin C
   └── Plugin D
```

Chaque plugin peut exposer ses propres capacités et actions au Hub.

Cette organisation permet de maintenir une architecture modulaire et extensible.

---

# 🛡️ Principe d'Isolation

Le Hub a été conçu afin que les outils restent isolés du cœur de Maya.

Une erreur ou une modification dans un plugin ne doit pas nécessiter de modifier :

- l'interface utilisateur ;
- le système VRM ;
- le système vocal ;
- l'historique des conversations ;
- le moteur LLM.

Cette isolation constitue l'un des principaux avantages de l'architecture actuelle.

---

# 📊 État actuel du Hub

| Composant | État |
|---|---|
| Hub Central | ✅ Fonctionnel |
| Plugin Manager | ✅ Fonctionnel |
| API Hub | ✅ Fonctionnelle |
| Dashboard Web | ✅ Fonctionnel |
| Architecture modulaire | ✅ Fonctionnelle |
| Connexion avec l'interface Maya | ✅ Fonctionnelle |
| Indicateur de connexion côté interface | ✅ Fonctionnel |
| Module WiZ | ✅ Fonctionnel |
| Module MCP Créatif | ✅ Fonctionnel |
| Module DeepSearch | ✅ Fonctionnel |
| Plugin MEMORY | ✅ Fonctionnel |
| Auto-Learning | ✅ Fonctionnel |

---

# 🚀 Philosophie du Hub

Le Hub n'a pas vocation à devenir un second cœur de Maya.

Son rôle est de fournir une **couche d'abstraction stable entre Maya et ses outils**.

Cela permet de faire évoluer séparément :

- l'interface ;
- le LLM ;
- la mémoire ;
- les outils ;
- les systèmes d'autonomie ;
- les services externes.

Le Hub devient ainsi le point de contrôle central de l'écosystème Maya.

> **Maya réfléchit.**
>
> **Le Hub lui donne les moyens d'agir.**

---

# 🔮 Évolutions futures

Les évolutions du Hub devront préserver son principe fondamental :

> **Ajouter des capacités sans augmenter inutilement la complexité du cœur de Maya.**

Les évolutions pourront notamment concerner :

- l'amélioration de la gestion des plugins ;
- l'amélioration du Dashboard ;
- de nouveaux outils MCP ;
- l'amélioration de la supervision des services ;
- l'amélioration de l'Auto-Learning ;
- une meilleure gestion des erreurs et états de connexion ;
- la simplification du déploiement du Hub avec Maya.

La priorité reste cependant la **stabilité de l'architecture actuelle** avant l'ajout de nouvelles fonctionnalités.
