# 🤖 Project M.A.Y.A.

> **M**odular **A**vatar & **Y**oked **A**gent  
> Built on the **M.A.Y.A.** principle:
>
> **M**ost **A**dvanced, **Y**et **A**cceptable

---

# 📖 Architecture & System Design Documentation

**M.A.Y.A.** est un projet d'assistant IA local, incarné et modulaire.

L'objectif est de construire un compagnon capable de conserver son contexte dans le temps, d'utiliser différents outils de manière autonome et d'interagir avec l'utilisateur à travers une véritable incarnation visuelle et vocale.

Le projet évolue aujourd'hui d'un prototype expérimental vers une **application complète avec interface propriétaire, avatar VRM, système vocal, historique des conversations et Hub centralisé pour les outils**.

> ⚠️ **Le code source est maintenu dans un dépôt privé.**
>
> La documentation technique, l'architecture et les choix d'ingénierie restent accessibles publiquement.

---

# 🖥️ État actuel du projet

L'interface propriétaire de Maya est désormais fonctionnelle et constitue le client principal du projet.

Elle regroupe notamment :

- l'avatar VRM ;
- le système de conversation ;
- le TTS ;
- l'historique des conversations ;
- la gestion des anciennes discussions ;
- la personnalisation de l'interface ;
- l'état de connexion aux outils du Hub.

## Interface Maya

> 📸 **Screenshot de l'interface actuelle à ajouter ici**

<!--
![Interface actuelle de Maya](./docs/images/maya-interface.png)
-->

---

## Maya Hub

Le **Maya Hub** constitue la couche centrale permettant à Maya d'utiliser ses différents outils.

> 📸 **Screenshot du Hub actuel à ajouter ici**

<!--
![Dashboard actuel du Maya Hub](./docs/images/maya-hub.png)
-->

---

# 📌 Pourquoi ce projet ?

Le projet **M.A.Y.A.** est né d'un constat d'insatisfaction face aux assistants IA commerciaux au début de l'année 2026.

L'objectif était de concevoir un véritable compagnon IA capable d'évoluer dans le temps tout en restant entièrement local.

---

# Les limites observées

## 🧠 Perte de contexte

Même avec de très larges fenêtres de contexte, les assistants finissent par oublier :

- la personnalité ;
- les habitudes ;
- les informations importantes accumulées au fil des jours.

---

## 💬 Style de réponse rigide

Les réponses deviennent souvent :

- trop longues ;
- trop formatées ;
- répétitives ;
- peu naturelles.

---

## 🔒 Contrôle & Vie privée

L'objectif était de construire un assistant :

- entièrement local ;
- totalement personnalisable ;
- indépendant des services SaaS.

---

# 🚀 Évolution du projet

```text
[LM Studio + AnythingLLM]
            │
            ▼
      [SillyTavern]
            │
            ▼
   [OpenLLMVTuber]
            │
            ▼
┌───────────────────────────────┐
│       Architecture Maya      │
│                               │
│  Interface propriétaire       │
│  Avatar VRM                   │
│  TTS                          │
│  Historique                   │
│  Hub Central MCP              │
│  Mémoire multicouche          │
│  Plugins                      │
│  Auto-Learning                │
└───────────────────────────────┘
```

---

## Phase 1 — Les bases

Premières expérimentations avec **LM Studio** et **AnythingLLM**.

Objectif :

- faire fonctionner un LLM entièrement en local ;
- expérimenter les différents systèmes de mémoire et d'interaction.

---

## Phase 2 — L'incarnation

Migration vers **SillyTavern**, puis **OpenLLMVTuber**, afin de donner une personnalité, une voix et une incarnation visuelle au modèle.

Ces expérimentations ont permis de valider le concept mais ont également mis en évidence les limites des architectures existantes.

---

## Phase 3 — Modularité & Hub Central

Développement du **Maya Hub** afin de centraliser les outils et de créer une architecture réellement modulaire.

Le Hub devient progressivement le point central d'intégration de Maya.

---

## Phase 4 — Interface propriétaire

Développement d'une interface dédiée à Maya.

Cette étape marque le passage d'un assemblage de composants existants vers une véritable application cohérente.

L'interface intègre désormais :

- avatar VRM ;
- changement de modèle VRM ;
- changement de fond ;
- TTS ;
- chat ;
- historique des conversations ;
- reprise des anciennes discussions ;
- suppression des conversations ;
- état de connexion aux outils.

---

# 🧠 Évolution du système de mémoire

L'un des principaux défis d'un compagnon IA local est de conserver un historique sur le long terme sans saturer la fenêtre de contexte.

---

## V1 — Journal manuel

Une commande `/save` permet au LLM de résumer la journée dans un fichier texte réinjecté au prompt système.

### Limite

Le prompt devenait rapidement énorme et les performances diminuaient fortement.

---

## V2 — Mémoire multicouche auto-évolutive

La mémoire est désormais séparée en plusieurs couches.

### 📄 Journal récent

Conserve les informations récentes de Maya.

---

### 📚 Journal d'archives

Les anciennes entrées sont automatiquement déplacées vers les archives.

---

### 🧬 Core de personnalité

L'identité profonde de Maya est isolée dans un fichier dédié et injectée en permanence.

---

### 📈 Auto-évolution

Les systèmes d'Auto-Learning peuvent enrichir les connaissances et compétences de Maya indépendamment du Core de personnalité.

---

# 🏗️ Architecture globale

```text
┌─────────────────────────────────────────────────────────┐
│                 1. Mémoire Multicouche                  │
│       Core • Journal récent • Archives • Compétences    │
└────────────────────────────┬────────────────────────────┘
                             │
                      Context + Prompt
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  2. Moteur LLM Local                    │
│              Génération de la réponse                   │
└────────────────────────────┬────────────────────────────┘
                             │
                    Texte + Tool Calls
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  3. Hub Central (MCP)                    │
│            Orchestration & Exécution des outils         │
│                                                         │
│  • DeepSearch                                            │
│  • Plugin MEMORY                                         │
│  • Auto-Learning                                         │
│  • Filtre Sémantique                                     │
└────────────────────────────┬────────────────────────────┘
                             │
                    Réponse enrichie + Actions
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              4. Interface & Incarnation                 │
│       Avatar VRM • TTS • Historique • Chat              │
└─────────────────────────────────────────────────────────┘
```

---

# ✨ Fonctionnalités clés

## 🎭 Incarnation visuelle

- Avatar VRM interactif ;
- changement de modèle VRM ;
- changement d'arrière-plan ;
- interface propriétaire dédiée ;
- architecture préparée pour des animations VRM avancées.

---

## 🎙️ Interaction vocale

- Speech-to-Text ;
- Text-to-Speech ;
- intégration directe du TTS dans l'interface ;
- pipeline vocal indépendant du reste de l'architecture.

---

## 💬 Gestion des conversations

L'historique des conversations est désormais stable.

Il permet :

- d'enregistrer les conversations ;
- d'afficher les discussions précédentes ;
- de reprendre une ancienne conversation ;
- de supprimer une conversation ;
- de conserver plusieurs sessions indépendantes.

---

## 🔌 Hub Central & Dashboard

- Architecture MCP ;
- gestion centralisée des outils ;
- Dashboard Web ;
- visualisation des plugins ;
- gestion des services ;
- supervision de l'état du système ;
- communication avec l'interface Maya.

---

## 🔍 DeepSearch

Module permettant à Maya d'effectuer des recherches Web approfondies.

Il peut notamment :

- effectuer plusieurs recherches ;
- réaliser des recherches secondaires ;
- croiser les informations ;
- produire une synthèse finale ;
- être utilisé par les systèmes autonomes.

---

## 🧠 Plugin MEMORY

Le Plugin MEMORY est dédié aux connaissances et compétences de Maya.

Il est séparé de la mémoire de personnalité.

Il peut notamment conserver :

- des compétences ;
- des procédures ;
- des connaissances techniques ;
- des informations validées ;
- des résultats issus de recherches.

---

## 🤖 Auto-Learning

Le système d'Auto-Learning permet à Maya d'effectuer automatiquement des missions de veille.

### Fonctionnement

- Vérification toutes les **20 minutes** ;
- maximum **1 exécution par jour et par sujet** ;
- rotation automatique **Round Robin** ;
- recherches via DeepSearch ;
- comparaison sémantique avec les connaissances existantes ;
- archivage uniquement des nouvelles informations.

Le filtre sémantique utilise notamment le statut :

```text
NO_NEW_INFO
```

afin d'éviter de sauvegarder des informations déjà connues.

---

# 🟢🔴 État des outils

L'interface Maya dispose désormais d'un indicateur visuel permettant de connaître immédiatement l'état de connexion aux outils du Hub.

### 🟢 Vert

La connexion au Hub et aux outils est opérationnelle.

### 🔴 Rouge

La connexion au Hub ou aux outils est indisponible.

Cette information permet de diagnostiquer rapidement un problème de connexion sans avoir à consulter les logs.

---

# 🔒 100 % Local & Privé

Maya est conçue autour d'une philosophie **Local First**.

Les principaux composants du système peuvent fonctionner localement :

- LLM ;
- mémoire ;
- historique ;
- TTS ;
- STT ;
- Hub ;
- outils ;
- interface.

L'objectif est de conserver les données et les traitements localement autant que possible.

> **Maya est conçue pour que les données personnelles restent sous le contrôle de l'utilisateur.**

---

# 🧩 Architecture modulaire

L'un des objectifs principaux de Maya est de limiter les dépendances entre les différents composants.

```text
                 ┌─────────────────┐
                 │    Maya UI      │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │    Maya Hub     │
                 │       MCP       │
                 └────────┬────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
        DeepSearch      MEMORY     Auto-Learning
```

Cette approche permet notamment de :

- remplacer un moteur vocal sans refaire l'interface ;
- ajouter un outil au Hub sans modifier le système VRM ;
- modifier l'apparence de Maya sans modifier le LLM ;
- faire évoluer l'historique indépendamment du Hub ;
- faire évoluer les services autonomes indépendamment de l'interface.

---

# 📊 État actuel du projet

| Fonctionnalité | État |
|---|---|
| Interface propriétaire | ✅ Fonctionnelle |
| Avatar VRM | ✅ Fonctionnel |
| Changement de VRM | ✅ Fonctionnel |
| Changement de fond | ✅ Fonctionnel |
| Chat | ✅ Fonctionnel |
| Historique des conversations | ✅ Stable |
| Reprise des conversations | ✅ Fonctionnelle |
| Suppression des conversations | ✅ Fonctionnelle |
| TTS | ✅ Fonctionnel |
| Maya Hub | ✅ Fonctionnel |
| Dashboard Web | ✅ Fonctionnel |
| DeepSearch | ✅ Fonctionnel |
| Plugin MEMORY | ✅ Fonctionnel |
| Auto-Learning | ✅ Fonctionnel |
| Scheduler | ✅ Fonctionnel |
| Filtre `NO_NEW_INFO` | ✅ Fonctionnel |
| Indicateur de connexion | ✅ Fonctionnel |

---

# 📚 Documentation

La documentation technique détaillée est disponible dans le dossier [`docs`](./docs/).

---

## 🛠️ Dev Journey

[**`dev.journey.md`**](./docs/dev.journey.md)

Contient :

- l'historique du projet ;
- les choix techniques ;
- les expérimentations ;
- les difficultés rencontrées ;
- l'évolution de l'architecture ;
- la roadmap vers la V1.0.

---

## 🔌 Hub Central

[**`hub.md`**](./docs/hub.md)

Contient :

- l'architecture du Hub ;
- le système de plugins ;
- le Dashboard ;
- DeepSearch ;
- MEMORY ;
- Auto-Learning ;
- Scheduler ;
- Round-Robin ;
- filtre sémantique.

---

## 🧠 Mémoire

[**`memory.md`**](./docs/memory.md)

Contient :

- le Core de personnalité ;
- le journal récent ;
- les archives ;
- les compétences ;
- l'évolution de la mémoire.

---

## 🎭 Interface & Incarnation

[**`plugin.md`**](./docs/plugin.md)

Contient :

- l'interface propriétaire ;
- le moteur VRM ;
- le TTS ;
- le STT ;
- l'historique ;
- l'évolution depuis OpenLLMVTuber ;
- l'architecture de l'incarnation.

---

# 🛠️ Stack Technique

| Domaine | Technologies |
|---|---|
| **Langage** | Python 3.11+ |
| **Hub** | Flask + HTML5 + CSS3 |
| **Dashboard** | Glassmorphism / Neon UI |
| **Interface / Avatar** | Tauri + Three.js + VRM |
| **LLM** | LM Studio · Ollama · llama.cpp |
| **Modèles** | Gemma 4 12B · autres modèles locaux |
| **Protocoles** | MCP (Model Context Protocol) |
| **Speech-to-Text** | Fast-Whisper |
| **Text-to-Speech** | Edge-TTS · Kokoro |
| **Mémoire** | Fichiers texte `.txt` |
| **Historique** | Stockage local des conversations |

---

# 🔮 Roadmap

Le projet entre maintenant dans une phase de consolidation.

Les prochaines évolutions envisagées comprennent notamment :

- 🪟 Mode **Overlay / Desktop Pet** ;
- 🎭 animations VRM plus avancées ;
- 👄 amélioration du Lip-Sync ;
- 🎙️ évolution du système vocal ;
- 📦 packaging de Maya en application autonome ;
- 🚀 lancement simplifié des différents services ;
- 🔌 extension du catalogue de plugins ;
- 🧠 amélioration de la mémoire et de l'Auto-Learning ;
- 💻 simplification de l'installation et du déploiement.

La priorité reste cependant la **stabilité de l'architecture actuelle** avant l'ajout de nouvelles fonctionnalités majeures.

---

# 🧠 Principe d'ingénierie

Maya n'a pas pour objectif de réinventer chaque composant de l'écosystème IA.

Le projet cherche plutôt à construire une architecture capable de réunir efficacement différentes briques spécialisées.

```text
        LLM
         │
         ├────────── Mémoire
         │
         ├────────── TTS / STT
         │
         ├────────── VRM
         │
         └────────── Maya Hub
                         │
              ┌──────────┼──────────┐
              │          │          │
         DeepSearch    MEMORY   Auto-Learning
```

Chaque composant peut évoluer sans nécessiter une refonte complète du système.

> **L'objectif n'est pas de tout réinventer.**
>
> **L'objectif est de faire fonctionner les différentes briques comme un seul système.**

---

# 📌 Projet

**M.A.Y.A. — Modular Avatar & Yoked Agent**

Un assistant IA local, modulaire, incarné et conçu pour évoluer dans le temps.

> **M**ost **A**dvanced, **Y**et **A**cceptable.

---

⭐ Le projet est actuellement documenté publiquement tandis que le code source reste privé.

Les retours, idées et discussions autour de l'architecture sont les bienvenus.
