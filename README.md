# 🤖 Project M.A.Y.A.

> **M**odular **A**vatar & **Y**oked **A**gent  
> Built on the **M.A.Y.A.** principle:
>
> **M**ost **A**dvanced, **Y**et **A**cceptable

---

# 📖 Architecture & System Design Documentation

**M.A.Y.A.** est un projet d'assistant IA local, incarné et modulaire.

L'objectif est de construire un compagnon capable de conserver son contexte dans le temps, d'utiliser différents outils de manière autonome et d'interagir avec l'utilisateur à travers une véritable incarnation visuelle et vocale.

Le projet évolue aujourd'hui d'un prototype expérimental vers une **application complète avec interface propriétaire, avatar VRM, système vocal hybride, historique des conversations et Hub centralisé pour les outils**.

> ⚠️ **Le code source est maintenu dans un dépôt privé.**
>
> La documentation technique, l'architecture et les choix d'ingénierie restent accessibles publiquement.

---

# 🖥️ État actuel du projet

L'interface propriétaire de Maya est désormais fonctionnelle et constitue le client principal du projet.

Elle regroupe notamment :

- l'avatar VRM avec **clignement d'yeux naturel automatique** et gestion d'expressions ;
- le système de conversation temps réel ;
- le panneau de **paramètres intégré (Options UI)** pour contrôler à chaud le LLM, le contexte et la voix ;
- le moteur vocal hybride (**Edge-TTS** en ligne / **Piper TTS** 100 % local) ;
- l'historique des conversations avec reprise et suppression de sessions ;
- la personnalisation de l'interface (modèles VRM, arrière-plans) ;
- l'état de connexion en direct aux outils du Hub.

## Interface Maya

img width="781" height="913" alt="image" src="https://github.com/user-attachments/assets/00aa587b-57b0-4b96-931f-5f3bfa4582e3" />

## Maya Hub

Le **Maya Hub** constitue la couche centrale permettant à Maya d'utiliser ses différents outils (**DeepSearch, MEMORY, Auto-Learning**).

img width="794" height="754" alt="Capture d&#39;écran 2026-08-08 085321" src="https://github.com/user-attachments/assets/327714f0-a386-4186-a283-633ffba4a883" />

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
    │       Architecture Maya       │
    │                               │
    │  Interface propriétaire       │
    │  Avatar VRM + Eye Blink       │
    │  TTS (Edge-TTS & Piper Local) │
    │  Panneau Options UI dynamique │
    │  Historique & Sessions        │
    │  Hub Central MCP              │
    │  Mémoire multicouche          │
    │  Plugins & Auto-Learning      │
    └───────────────────────────────┘

## Phase 1 — Les bases

Premières expérimentations avec **LM Studio** et **AnythingLLM**.

Objectif :

- faire fonctionner un LLM entièrement en local ;
- expérimenter les différents systèmes de mémoire et d'interaction.

## Phase 2 — L'incarnation

Migration vers **SillyTavern**, puis **OpenLLMVTuber**, afin de donner une personnalité, une voix et une incarnation visuelle au modèle.

Ces expérimentations ont permis de valider le concept mais ont également mis en évidence les limites des architectures existantes.

## Phase 3 — Modularité & Hub Central

Développement du **Maya Hub** afin de centraliser les outils et de créer une architecture réellement modulaire.

Le Hub devient progressivement le point central d'intégration de Maya.

## Phase 4 — Interface propriétaire & Refonte Vocale

Développement d'une interface dédiée à Maya et intégration des réglages à chaud.

L'interface intègre désormais :

- **Avatar VRM** avec clignement d'yeux automatique et animations ;
- **Panneau de configuration complet (Options UI)** : sélection dynamique du moteur TTS, des voix, de la langue, du modèle `.gguf`, de la fenêtre de contexte et du nombre de messages injectés ;
- **Moteur vocal hybride** : intégration de **Piper TTS** pour un rendu vocal local instantané, en complément de **Edge-TTS** (abandon de Kokoro TTS pour des raisons d'instabilité d'installation) ;
- **Changement de modèle VRM et d'arrière-plan** ;
- **Gestionnaire de conversations** (sauvegarde, chargement, suppression) ;
- **Supervision temps réel** du Hub (indicateur d'état connecté/déconnecté).

---

# 🧠 Évolution du système de mémoire

L'un des principaux défis d'un compagnon IA local est de conserver un historique sur le long terme sans saturer la fenêtre de contexte.

## V1 — Journal manuel

Une commande `/save` permet au LLM de résumer la journée dans un fichier texte réinjecté au prompt système.

## V2 — Mémoire multicouche auto-évolutive

La mémoire est désormais séparée en plusieurs couches :

- 📄 **Journal récent** : conserve les interactions quotidiennes et récentes.
- 📚 **Journal d'archives** : transfert automatique des anciennes entrées.
- 🧬 **Core de personnalité** : identité profonde de Maya préservée dans un fichier permanent.
- 📈 **Auto-évolution** : compétences et connaissances acquises via l'Auto-Learning.

---

# 🏗️ Architecture globale

    ┌─────────────────────────────────────────────────────────┐
    │                  1. Mémoire Multicouche                 │
    │        Core • Journal récent • Archives • Compétences   │
    └────────────────────────────┬────────────────────────────┘
                                 │
                          Context + Prompt
                                 │
                                 ▼
    ┌─────────────────────────────────────────────────────────┐
    │                  2. Moteur LLM Local                    │
    │            Génération de la réponse (llama.cpp)         │
    └────────────────────────────┬────────────────────────────┘
                                 │
                        Texte + Tool Calls
                                 │
                                 ▼
    ┌─────────────────────────────────────────────────────────┐
    │                  3. Hub Central (MCP)                   │
    │            Orchestration & Exécution des outils         │
    │                                                         │
    │  • DeepSearch                                           │
    │  • Plugin MEMORY                                        │
    │  • Auto-Learning                                        │
    │  • Filtre Sémantique                                    │
    └────────────────────────────┬────────────────────────────┘
                                 │
                        Réponse enrichie + Actions
                                 │
                                 ▼
    ┌─────────────────────────────────────────────────────────┐
    │               4. Interface & Incarnation                │
    │   Avatar VRM (Blink) • Piper/Edge TTS • Options UI      │
    └─────────────────────────────────────────────────────────┘

---

# ✨ Fonctionnalités clés

## 🎭 Incarnation visuelle

- Avatar VRM interactif avec **clignement d'yeux naturel (Blink)** ;
- changement dynamique de modèle VRM ;
- personnalisation des fonds d'écran ;
- interface propriétaire dédiée avec tiroirs d'options.

## 🎙️ Moteur vocal hybride (TTS / STT)

- **Edge-TTS** : voix cloud haute qualité.
- **Piper TTS** : moteur TTS local ultrarapide, léger et réactif.
- **Speech-to-Text** : intégration STT pour le contrôle vocal.
- Pipeline audio modulaire débrayable à tout moment.

> **Note :** Kokoro TTS a été abandonné suite à sa complexité d'installation et à son manque de stabilité.

## ⚙️ Configuration centralisée (Options UI)

- sélection dynamique du moteur vocal (Edge / Piper) et des voix disponibles ;
- changement de modèle LLM `.gguf` à chaud ;
- ajustement de la taille de contexte serveur (4k à 131k tokens) ;
- contrôle du nombre de messages d'historique réinjectés dans le prompt ;
- édition du System Prompt et des sujets d'Auto-Learning.

## 💬 Gestion des conversations

- enregistrement des sessions de chat ;
- historique complet avec prévisualisation et suppression ;
- possibilité de reprendre n'importe quelle ancienne discussion sans perte de contexte.

## 🔌 Hub Central & Auto-Learning

- architecture MCP et Dashboard Web centralisé ;
- **DeepSearch** : moteur de recherche web autonome multicouche ;
- **Plugin MEMORY** : base de connaissances techniques et compétences séparée du Core ;
- **Auto-Learning** : tâche de fond programmée (Round Robin toutes les 20 min) avec filtre sémantique `NO_NEW_INFO` pour éviter les doublons.

---

# 📊 État actuel du projet

| **Fonctionnalité** | **État** |
|---|---|
| Interface propriétaire | ✅ Fonctionnelle |
| Avatar VRM + Clignement d'yeux | ✅ Fonctionnel |
| Changement de VRM & Fond | ✅ Fonctionnel |
| Panneau d'options UI à chaud | ✅ Fonctionnel |
| Chat & Historique des sessions | ✅ Stable |
| Edge-TTS | ✅ Fonctionnel |
| Piper TTS (Local) | ✅ Intégré & Fonctionnel |
| Kokoro TTS | ❌ Abandonné |
| Maya Hub & Dashboard | ✅ Fonctionnel |
| DeepSearch & Plugin MEMORY | ✅ Fonctionnel |
| Auto-Learning & Scheduler | ✅ Fonctionnel |
| Indicateur de connexion Hub | ✅ Fonctionnel |


<img width="1369" height="890" alt="Capture d&#39;écran 2026-08-09 195450" src="https://github.com/user-attachments/assets/9dbad52c-d914-4ac1-a221-5bd25756220d" />

---

# 📚 Documentation

La documentation technique détaillée est accessible dans le dossier [`docs`](./docs/) :

- [**`dev.journey.md`**](./docs/dev.journey.md) — Historique du projet, arbitrages techniques et roadmap.
- [**`hub.md`**](./docs/hub.md) — Architecture du Hub MCP, DeepSearch et Auto-Learning.
- [**`memory.md`**](./docs/memory.md) — Gestion de la mémoire multicouche et du Core.
- [**`plugin.md`**](./docs/plugin.md) — Moteur VRM, Piper TTS, STT et interface utilisateur.

---

# 🛠️ Stack Technique

| **Domaine** | **Technologies** |
|---|---|
| **Langage** | Python 3.11+ · JavaScript (ES6 Modules) |
| **Backend Hub** | Flask · MCP Protocol |
| **Interface / Avatar** | Three.js · `@pixiv/three-vrm` · HTML5 / CSS3 (Dark Theme) |
| **LLM Moteur** | llama.cpp · Ollama · LM Studio |
| **Text-to-Speech (TTS)** | **Piper TTS** (Local) · **Edge-TTS** (Cloud) |
| **Speech-to-Text (STT)** | Fast-Whisper |
| **Mémoire & Config** | Fichiers JSON · `.txt` |

---

# 🔮 Roadmap

Les prochaines étapes du projet :

- 🪟 Mode **Overlay / Desktop Pet** (fenêtre transparente toujours au premier plan) ;
- 🎭 synchronisation labiale avancée (Lip-Sync audio-driven) ;
- 📦 packaging standalone (application exécutable clé en main) ;
- 🔌 nouveaux plugins pour le Maya Hub.

---

# 📌 Projet

**M.A.Y.A. — Modular Avatar & Yoked Agent**

*Un assistant IA local, modulaire, incarné et conçu pour évoluer dans le temps.*

> **M**ost **A**dvanced, **Y**et **A**cceptable.
