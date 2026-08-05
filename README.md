# 🤖 Project M.A.Y.A.

> **M**odular **A**vatar & **Y**oked **A**gent  
> *Built on the M.A.Y.A. principle: **M**ost **A**dvanced, **Y**et **A**cceptable.*

# 📖 Architecture & System Design Documentation

Ce dépôt documente l'architecture, le design système et les concepts d'ingénierie du projet **Maya**.

> **Le code source est maintenu dans un dépôt privé.**

---

# 📌 Pourquoi ce projet ?

Le projet **Maya** est né d'un constat d'insatisfaction face aux assistants IA commerciaux (ChatGPT, Gemini, etc.) au début de l'année 2026.

## Les limites observées

### 🧠 Perte de contexte

Même avec de larges fenêtres de contexte, les assistants finissent par oublier :

- la personnalité ;
- les habitudes ;
- les informations importantes accumulées au fil des jours.

### 💬 Style de réponse rigide

Les réponses deviennent souvent :

- trop longues ;
- trop formatées ;
- répétitives ;
- peu naturelles.

### 🔒 Contrôle & Vie privée

L'objectif était de construire un véritable compagnon IA :

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
 (Hub Central + Mémoire Multicouche)
```

## Phase 1 — Les bases

Premières expérimentations avec :

- LM Studio
- AnythingLLM

Objectif :

- faire fonctionner un LLM entièrement en local.

---

## Phase 2 — L'incarnation

Migration vers **SillyTavern** afin de donner une personnalité et une interface au modèle.

Résultat :

- système fonctionnel ;
- mais lourd ;
- difficile à personnaliser en profondeur.

---

## Phase 3 — La modularité

Découverte d'**OpenLLMVTuber**.

Cette interface devient le socle :

- visuel ;
- audio ;
- modulaire.

Elle servira ensuite de base à l'architecture Maya.

---

# 🧠 Évolution du Système de Mémoire

L'un des principaux défis d'un compagnon IA local est de conserver un historique sur le long terme sans saturer la fenêtre de contexte.

---

## V1 — Le Journal Manuel

### Principe

Une commande `/save` permet au LLM de résumer la journée dans un fichier texte.

### Fonctionnement

Le journal est directement réinjecté dans le prompt système.

### Limite rencontrée

Après quelques semaines :

- le prompt devient énorme ;
- les performances chutent ;
- le contexte finit par saturer.

---

## V2 — Mémoire Multicouche Auto-Évolutive

Pour résoudre ce problème, la mémoire est entièrement repensée.

### Journal Récent

- conserve les 30 derniers jours ;
- sert au contexte immédiat.

### Journal d'Archives

Les anciennes entrées sont déplacées automatiquement.

### Core de Personnalité

L'identité profonde de Maya est isolée dans un fichier indépendant, injecté en permanence.

### Auto-Évolution

Lors du passage vers les archives :

- les habitudes sont analysées ;
- les comportements récurrents sont détectés ;
- une mise à jour du Core peut être proposée afin de faire évoluer naturellement la personnalité.

---

# 🏗️ Architecture Globale

```text
┌─────────────────────────────────────────────────────────┐
│                 1. Mémoire Multicouche                  │
│      Core • Journal 30 jours • Archives • Habitudes     │
└────────────────────────────┬────────────────────────────┘
                             │
                   Context + Prompt
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  2. Moteur LLM Local                    │
│             Génération de la pensée / réponse           │
└────────────────────────────┬────────────────────────────┘
                             │
                    Texte + Tool Calls
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 3. Hub Central (MCP)                    │
│          Orchestration & Exécution des outils           │
│                                                         │
│ • Plugin MEMORY (Compétences)                           │
│ • Domotique WiZ                                         │
│ • DeepSearch                                            │
│ • Auto-Learning                                         │
│ • Filtre Sémantique Anti-Doublons                       │
└────────────────────────────┬────────────────────────────┘
                             │
                 Réponse enrichie + Actions
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              4. Interface & Incarnation                 │
│      Avatar VRM • Overlay Desktop Pet • Synthèse Vocale │
└─────────────────────────────────────────────────────────┘
```

---

# ✨ Fonctionnalités Clés

## 🎭 Incarnation Visuelle & Audio

- Avatar VRM interactif.
- Synthèse vocale locale.
- STT avec Fast-Whisper.
- TTS Edge-TTS ou Kokoro.

---

## 🧠 Mémoire Structurée

### Court Terme

Contexte immédiat de la conversation.

### Long Terme

Historique complet des journaux.

### Core

Personnalité permanente de Maya.

### Compétences

Mémoire des procédures, savoir-faire et connaissances applicatives.

---

## 🌱 Auto-Évolution du Caractère

Analyse automatique des archives afin :

- d'identifier les habitudes ;
- d'enrichir progressivement le Core.

---

## 🔌 Hub MCP Modulaire

Le Hub central orchestre tous les outils :

- Domotique WiZ
- DeepSearch
- Plugin MEMORY
- Modules créatifs
- Extensions futures

L'ajout d'un nouveau plugin ne nécessite aucune modification du pipeline principal.

---

## 🤖 Idle Auto-Learning (V1)

Lorsque l'utilisateur est inactif :

- le Scheduler attend 20 minutes d'inactivité continue ;
- sélectionne automatiquement un objectif via une rotation **Round-Robin** basée sur `last_checked` ;
- lance une recherche DeepSearch ;
- applique un filtre sémantique.

Deux cas sont possibles :

```text
Nouvelle information
        │
        ▼
Sauvegarde Plugin MEMORY

----------------------------

Information déjà connue
        │
        ▼
NO_NEW_INFO
(Aucune sauvegarde)
```

Cette mécanique permet une veille autonome continue sans polluer la mémoire.

---

## 🔒 100 % Local & Privé

Aucune donnée personnelle n'est envoyée vers des serveurs externes.

L'ensemble de l'architecture est conçu pour fonctionner entièrement en local.

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
| **Interface** | Tauri + Three.js + VRM |
| **LLM** | LM Studio / Ollama / llama.cpp |
| **Modèles recommandés** | Gemma 4 12B / E4B |
| **Protocole d'outils** | MCP (Model Context Protocol) |
| **Speech-to-Text** | Fast-Whisper |
| **Text-to-Speech** | Edge-TTS / Kokoro |
| **Stockage mémoire** | Fichiers texte (`.txt`) |
