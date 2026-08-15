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

Maya est passée d’un prototype web à une **application native** grâce à **Tauri**.

L’interface propriétaire regroupe désormais :

- Avatar VRM avec clignement d’yeux naturel, expressions faciales dynamiques (joie, tristesse, colère + blush) et animations manuelles (clic droit)
- Mode **Desktop Pet / Overlay** (fenêtre transparente, clics traversants, toujours au premier plan)
- Mémoire multicouche 100 % opérationnelle
- Modes **Actif / Passif** (relances autonomes vs attente de sollicitation)
- Moteur vocal hybride (Piper TTS local + Edge-TTS)
- Options UI dynamiques (LLM, contexte, voix, System Prompt, clé Tavily, etc.)
- Historique des conversations (reprise / suppression)
- Indicateur de connexion temps réel au Hub

## Interface Maya (mode classique)

<img width="1247" height="845" alt="interface" src="https://github.com/user-attachments/assets/f4d62f36-2163-413c-ad61-afd6135b2853" />

## Mode Desktop Pet (Overlay)

<img width="610" height="963" alt="overlay" src="https://github.com/user-attachments/assets/75944093-786f-4c72-97d9-0e97775f20e4" />

## Maya Hub

Le **Maya Hub** reste la couche centrale (DeepSearch, MEMORY, Auto-Learning, WiZ…).

<img width="1041" height="815" alt="hub" src="https://github.com/user-attachments/assets/cb2769f7-59ba-4af7-ac5e-2e5d2b69560a" />


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

    [LM Studio + Anything]
                │
                ▼
          [SillyTavern]
                │
                ▼
         [OpenVTuber]
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

Premières expérimentations avec **LM Studio** et **Anything**.

Objectif :

- faire fonctionner un  entièrement en local ;
- expérimenter les différents systèmes de mémoire et d'interaction.

## Phase 2 — L'incarnation

Migration vers **SillyTavern**, puis **OpenVTuber**, afin de donner une personnalité, une voix et une incarnation visuelle au modèle.

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

- ## Phase 5 — Native App & Desktop Pet (Août 2026)

Migration vers **Tauri** et passage en application native.

- Compilation et validation sous `tauri dev`
- Mode **Desktop Pet / Overlay** : fenêtre transparente avec hit-test dynamique (clics traversants)
- Gestion du Z-Index pour rester devant la barre des tâches Windows
- État atomique côté Rust (`OverlayState`) pour un retour instantané au contrôle de la souris
- Réparation des liens externes (bouton Hub port 5005)
- Stabilisation du code Rust (élimination des conflits de macros)
- Animation « Assis » + correction des timings de transition
- Mémoire multicouche complètement finalisée et testée
- Modes Actif / Passif validés

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
    │  Avatar VRM (Blink + Expressions + Animations)         │
    │  Mode Overlay / Desktop Pet (Tauri)                     │
    │  Piper/Edge TTS • Options UI • Modes Actif/Passif       │
    └─────────────────────────────────────────────────────────┘

---

# ✨ Fonctionnalités clés

## 🎭 Incarnation visuelle

- Avatar VRM interactif avec **clignement d'yeux naturel (Blink)** ;
- changement dynamique de modèle VRM ;
- personnalisation des fonds d'écran ;
- interface propriétaire dédiée avec tiroirs d'options.

### 🎭 Émotions & Expressions dynamiques
Gestion des expressions faciales et blendshapes (ARKit / VRM) en fonction du contexte de la conversation :

| Joyeuse 😊 | Triste 😢 | En colère 😡 |
| :---: | :---: | :---: |

<img width="609" height="438" alt="maya happy" src="https://github.com/user-attachments/assets/faa4f32b-bba1-418d-8b1d-f65e2da10e48" /> <img width="377" height="236" alt="maya sad" src="https://github.com/user-attachments/assets/8e9fda28-ae0c-4ae1-ba4c-b454537f414c" /> <img width="372" height="390" alt="maya angry" src="https://github.com/user-attachments/assets/118e0387-92bf-4a92-9dd6-9d6ea99832d5" />

## 🎙️ Moteur vocal hybride (TTS / STT)

- **Edge-TTS** : voix cloud haute qualité.
- **Piper TTS** : moteur TTS local ultrarapide, léger et réactif.
- **Speech-to-Text** : intégration STT pour le contrôle vocal.
- Pipeline audio modulaire débrayable à tout moment.

> **Note :** Kokoro TTS a été abandonné suite à sa complexité d'installation et à son manque de stabilité.

## ⚙️ Configuration centralisée (Options UI)

L'interface dispose d'un tiroir de paramètres modulaire et catégorisé, permettant de tout configurer à la volée sans recharger la page :

<img width="1042" height="790" alt="options" src="https://github.com/user-attachments/assets/e33ae2c1-166e-43ab-ab0f-2c92192583fa" />

---

### 🏠 Hub Central
* **Accès direct (Port 5005) :** Bouton de redirection rapide vers l'interface de gestion du Hub Maya dans un nouvel onglet.

---

### 🧠 LLM / Cerveau
 <img width="1053" height="765" alt="Capture d’écran 2026-08-14 121319" src="https://github.com/user-attachments/assets/5aca1aa2-7e81-4d1d-987a-35cafd582e03" />

* **Modèles `.gguf` à chaud :** Détection et sélection dynamique des modèles LLM présents dans le dossier `/model GGUF`.
* **Vision & Détection Auto `mmproj` :** Association automatique du fichier de projection visuelle correspondant au modèle loaded.
* **Taille du contexte serveur :** Ajustement de la mémoire de travail de Llama.cpp (de 4k à 131k tokens).
* **Fenêtre de conversation :** Contrôle précis du nombre de messages réinjectés dans le prompt à chaque requête.

---

### 🎙️ Voix & Synthèse
<img width="1049" height="796" alt="options voix" src="https://github.com/user-attachments/assets/92873116-c31c-4a7c-afd0-193c8936d8c0" />

* **Moteur vocal (TTS) :** Choix dynamique entre Edge-TTS (en ligne) et Piper TTS (local).
* **Langues & Voix :** Filtrage intelligent et sélection des voix disponibles selon le moteur choisi.

---

### 📝 System Prompt & Deepsearch
 <img width="1019" height="781" alt="Capture d’écran 2026-08-14 121445" src="https://github.com/user-attachments/assets/d01facc6-b2e2-451d-a0d6-ebf24395bf42" />

* **Personnalité (System Prompt) :** Édition en direct des consignes de rôle de Maya.
* **Recherche Web Autonome :** Gestion des objectifs de veille stratégique mis à jour directement dans `goals.json`.
* **Clé API Tavily Custom :** Champ dédié permettant à chaque utilisateur de configurer sa propre clé de recherche web.

---

### ⚡ Mode Actif / Passif
 <img width="1041" height="771" alt="option proactif" src="https://github.com/user-attachments/assets/e76a4868-7145-4a20-b1b0-b4e25caa7d46" />


* **Mode d'interaction :** Bascule entre le mode **Passif** (répond uniquement aux sollicitations) et le mode **Actif** (relance de conversation).
* **Délai d'inactivité :** Réglage précis du temps d'attente (en secondes) avant déclenchement d'une relance autonome.
  
## 💬 Gestion des conversations

- enregistrement des sessions de chat ;
- historique complet avec prévisualisation et suppression ;
- possibilité de reprendre n'importe quelle ancienne discussion sans perte de contexte.

## 🔌 Hub Central & Auto-Learning

- architecture MCP et Dashboard Web centralisé ;
- **DeepSearch** : moteur de recherche web autonome multicouche avec clé Tavily personnalisable ;
- **Plugin MEMORY** : base de connaissances techniques et compétences séparée du Core ;
- **Auto-Learning Régulé** : cycle de 20 minutes qui vérifie si une interaction réelle avec l'IA a eu lieu avant exécution (avec affichage du **timer en temps réel** sur le Hub).

---

# 📊 État actuel du projet

| Fonctionnalité                              | État                  |
|---------------------------------------------|-----------------------|
| Interface propriétaire                      | ✅ Fonctionnelle      |
| Avatar VRM + Blink + Expressions + Blush    | ✅ Fonctionnel        |
| Animations manuelles (clic droit) + Assis   | ✅ Fonctionnel        |
| Mode Desktop Pet / Overlay (Tauri)          | ✅ Fonctionnel        |
| Mémoire multicouche                         | ✅ 100 % opérationnelle |
| Modes Actif / Passif                        | ✅ Validés            |
| Vision multimodal + détection auto mmproj   | ✅ Fonctionnel        |
| Options UI (5 panneaux + clé Tavily)        | ✅ Fonctionnelles     |
| TTS hybride (Piper local + Edge-TTS)        | ✅ Intégré & rapide   |
| Historique & sessions                       | ✅ Stable             |
| Hub MCP + Indicateur 🟢/🔴                  | ✅ Fonctionnel        |
| Auto-Learning (check interaction + timer)   | ✅ Opérationnel       |
| Packaging .exe standalone                   | ⬜ En cours           |
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
