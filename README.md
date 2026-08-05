# 🤖 Project M.A.Y.A.

> **M**odular **A**vatar & **Y**oked **A**gent  
> Built on the **M.A.Y.A.** principle:
>
> **M**ost **A**dvanced, **Y**et **A**cceptable

---

# 📖 Architecture & System Design Documentation

Ce dépôt documente l'architecture, le design système et les principaux concepts d'ingénierie du projet **M.A.Y.A.**

> ⚠️ **Le code source est maintenu dans un dépôt privé.**

---

# 📌 Pourquoi ce projet ?

Le projet **M.A.Y.A.** est né d'un constat d'insatisfaction face aux assistants IA commerciaux (ChatGPT, Gemini, etc.) au début de l'année 2026.

L'objectif était de concevoir un véritable compagnon IA, capable d'évoluer dans le temps tout en restant entièrement local.

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
  [Architecture Maya V1]
(Hub Central + Dashboard Web + Mémoire Multicouche)
```

---

## Phase 1 — Les bases

Premières expérimentations avec **LM Studio** et **AnythingLLM**.

Objectif :

- faire fonctionner un LLM entièrement en local.

---

## Phase 2 — L'incarnation

Migration vers **SillyTavern** afin de donner une personnalité et une interface au modèle.

Constat :

- système fonctionnel ;
- mais lourd ;
- difficile à personnaliser en profondeur.

---

## Phase 3 — Modularité & Hub Central

Adoption d'**OpenLLMVTuber** comme socle visuel et audio.

Développement du **Hub Central MCP** accompagné d'un **Dashboard Web** moderne permettant de piloter dynamiquement les modules et services système.

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

Conserve les **30 derniers jours**.

---

### 📚 Journal d'archives

Les anciennes entrées sont automatiquement déplacées.

---

### 🧬 Core de personnalité

L'identité profonde de Maya est isolée dans un fichier dédié et injectée en permanence.

---

### 📈 Auto-évolution

Analyse automatique des habitudes afin de faire évoluer naturellement la personnalité.

---

# 🏗️ Architecture globale

```text
┌─────────────────────────────────────────────────────────┐
│                 1. Mémoire Multicouche                  │
│     Core • Journal 30 jours • Archives • Habitudes      │
└────────────────────────────┬────────────────────────────┘
                             │
                      Context + Prompt
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  2. Moteur LLM Local                    │
│        Génération de la pensée / réponse                │
└────────────────────────────┬────────────────────────────┘
                             │
                    Texte + Tool Calls
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 3. Hub Central (MCP)                    │
│         Orchestration & Exécution des outils            │
│                                                         │
│  Dashboard Web (Glassmorphism / Neon UI)                │
│                                                         │
│ • Plugin MEMORY                                         │
│ • Domotique WiZ                                         │
│ • DeepSearch                                            │
│ • Auto-Learning                                         │
│ • Filtre Sémantique                                     │
└────────────────────────────┬────────────────────────────┘
                             │
                  Réponse enrichie + Actions
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              4. Interface & Incarnation                 │
│ Avatar VRM • Desktop Pet • Synthèse vocale              │
└────────────────────────────┴────────────────────────────┘
```

---

# ✨ Fonctionnalités clés

---

## 🎭 Incarnation visuelle & audio

- Avatar VRM interactif
- Synthèse vocale locale (Edge-TTS / Kokoro)
- Speech-to-Text avec Fast-Whisper

---

## 🎛️ Hub Central & Dashboard

- Interface Web moderne (Glassmorphism + Neon)
- Activation / désactivation des plugins à chaud
- Activation / désactivation des services système
- Inspection des capacités MCP en temps réel

---

## 🧠 Mémoire structurée

Séparation stricte entre :

- contexte court terme ;
- archives long terme ;
- Core de personnalité ;
- compétences techniques.

Le Core peut évoluer automatiquement selon les habitudes observées.

---

## 🤖 Auto-Learning (V2)

Le système fonctionne selon une cadence fixe.

### Fonctionnement

- Vérification toutes les **20 minutes**
- Maximum **1 exécution par jour et par sujet**
- Rotation automatique **Round Robin**
- Filtre sémantique **NO_NEW_INFO**
- Archivage uniquement des nouvelles connaissances

---

## 🔒 100 % Local & Privé

Aucune donnée personnelle n'est envoyée vers des services cloud.

---

# 📚 Documentation

* 🛠️ [**`dev.journey.md`**](./docs/dev.journey.md)
  * Historique du projet
  * Choix techniques
  * Architecture
  * Roadmap vers la V1.0

---

* 🔌 [**`hub.md`**](./docs/hub.md)
  * Architecture & Plugins
  * DeepSearch & Auto-Learning
  * Scheduler & Round-Robin
  * Filtre `NO_NEW_INFO`

---

* 🧠 [**`memory.md`**](./docs/memory.md)
  * Core & Personnalité
  * Journal 30 jours & Archives
  * Compétences

---

* 🎭 [**`plugin.md`**](./docs/plugin.md)
  * Avatar VRM & Moteur graphique
  * STT & TTS
  * Évolution depuis OpenLLMVTuber

---

# 🛠️ Stack Technique

| Domaine | Technologies |
|----------|--------------|
| **Langage** | Python 3.11+ |
| **Hub** | Flask + HTML5 + CSS3 |
| **Dashboard** | Glassmorphism / Neon UI |
| **Avatar** | Tauri + Three.js + VRM |
| **LLM** | LM Studio · Ollama · llama.cpp |
| **Modèles recommandés** | Gemma 4 12B · E4B |
| **Protocoles** | MCP (Model Context Protocol) |
| **Speech-to-Text** | Fast-Whisper |
| **Text-to-Speech** | Edge-TTS · Kokoro |
| **Mémoire** | Fichiers texte (.txt) |
