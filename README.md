# 🤖 Project M.A.Y.A.

> **M**odular **A**vatar & **Y**oked **A**gent  
> *Built on the M.A.Y.A. principle: **M**ost **A**dvanced, **Y**et **A**cceptable.*

### Document d'Architecture Système & Spécifications Technologiques

Ce dépôt documente l'architecture, le design système et les concepts d'ingénierie du projet Maya. Le code source est maintenu dans un dépôt privé.

---

## 📌 Pourquoi ce projet ? (Origin Story)

Le projet Maya est né d'un constat d'insatisfaction face aux modèles commerciaux en SaaS (ChatGPT, Gemini, etc.) début 2026 :

* **La perte de contexte (Amnésie) :** Même avec de grandes fenêtres de contexte, les assistants en ligne ont tendance à perdre le fil de la personnalité et des détails importants au bout de quelques jours de conversation.
* **La rigidité du style de réponse :** Des réponses souvent trop verbeuses, stéréotypées ("thèses en 15 catégories qui se répètent") et manquant d'un ton naturel ou authentique.
* **Le besoin de contrôle & de vie privée :** L'envie d'exécuter un compagnon IA à 100 % en local, personnalisé selon mes besoins.

### L'Évolution du projet (De l'expérimentation à l'architecture)

```text
[LM Studio + AnythingLLM] ──► [SillyTavern] ──► [OpenLLMVTuber] ──► [Architecture Maya V1]
  (Premiers tests locaux)     (Trop lourd)     (Base modulaire)    (Hub + Mémoire Multicouche)
```

* **Phase 1 (Les bases) :** Premiers pas en local avec le combo LM Studio + AnythingLLM.
* **Phase 2 (L'incarnation) :** Passage par SillyTavern pour donner "corps" au LLM. Système fonctionnel mais trop lourd au lancement et complexe à personnaliser à très bas niveau.
* **Phase 3 (La modularité) :** Découverte d'OpenLLMVTuber, une interface ouverte, légère et personnalisable qui a servi de socle visuel/audio initial.

---

## 🧠 L'Évolution du Système de Mémoire

L'un des plus grands défis d'un compagnon IA local est de conserver un historique à long terme sans exploser la fenêtre de contexte (et sans ruiner les performances).

### 1. La V1 : Le "Journal Intime" manuel
* **Principe :** Une commande `/save` permettant au LLM de résumer la journée dans un fichier journal.
* **Injection :** Ce journal était directement réinjecté dans le prompt système.
* **Limite rencontrée :** Au bout d'un mois, le prompt système devenait gigantesque, saturant le contexte et ralentissant les temps de réponse.

### 2. La V2 : La Mémoire Multicouche & Auto-Évolutive (Système actuel)
Pour résoudre ce problème de saturation, la mémoire a été découpée et automatisée :
* **Journal Récent (30 jours) :** Garde les souvenirs frais et vivants pour le contexte immédiat.
* **Journal Ancien (Archives) :** Un script transfère automatiquement les entrées de plus de 30 jours vers un stockage à long terme.
* **Séparation du "Core" (Personnalité) :** Le core (l'identité profonde de Maya) est isolé et injecté séparément.
* **Mécanisme d'Auto-Évolution du Caractère :** Lors du transfert vers les archives, le script scanne les récurrences et les habitudes. Si un comportement ou une préférence se répète régulièrement, le système propose une mise à jour du Core pour ancrer définitivement ce nouveau trait de caractère.

---

## 🏗️ Architecture Globale

```text
┌─────────────────────────────────────────────────────────┐
│                 1. Mémoire Multicouche                  │
│       (Injecte le Core, le Journal 30j et les habitudes)│
└────────────────────────────┬────────────────────────────┘
                             │ (Context + Prompt)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  2. Moteur LLM Local                    │
│             (Génération de la pensée/réponse)           │
└────────────────────────────┬────────────────────────────┘
                             │ (Texte + Tool Calls)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 3. Hub Central (MCP)                    │
│    ────── Orchestration & Exécution des Outils ──────   │
│    • Mémoire des compétences (Compétences dynamiques)   │
│    • Domotique (Contrôle des lumières WiZ / IoT)        │
│    • DeepSearch (Recherche web avancée)                 │
│    • MCP Créatif & Auto-Learning                        │
└────────────────────────────┬────────────────────────────┘
                             │ (Réponse enrichie + Actions)
                             ▼
┌─────────────────────────────────────────────────────────┐
│            4. Interface & Incarnation                   │
│   (Avatar VRM 3D, Overlay Desktop Pet, Synthèse vocale) │
└────────────────────────────┬────────────────────────────┘
```

---

## ✨ Fonctionnalités Clés

* **Incarnation Visuelle & Audio :** Avatar interactif avec synthèse vocale (Fast-Whisper / Edge-TTS / Kokoro local) et moteur 3D (VRM).
* **Système de Mémoire Structuré :**
  * **Court Terme :** Contexte immédiat de la session.
  * **Long Terme :** Historique archivé des journaux d'échanges.
  * **Core :** Identité et personnalité profonde de l'IA (injectée en permanence).
  * **Compétences :** Mémoire applicative des procédures et savoir-faire.
* **Auto-Évolution du Caractère :** Analyse dynamique du journal long terme pour mettre à jour le Core selon la répétition des habitudes.
* **Hub d'Outils Modulaire (MCP) :** Contrôle domotique (lumières), recherche web approfondie (DeepSearch), création et gestion des compétences (Auto-Learning).
* **100 % Local & Privé :** Aucune donnée envoyée vers des serveurs externes.

---

## 📚 Documentation Détaillée

Pour explorer toute la conception technique et le design système de Maya :

* 🛠️ [**dev.journey.md**](docs/dev.journey.md) : Génèse du projet, choix d'architecture, leçons de parcours et Roadmap vers la V1.0.
* 🔌 [**hub.md**](docs/hub.md) : Spécifications et fonctionnement du Hub MCP (outils, domotique, DeepSearch, Auto-Learning).
* 🧠 [**memory.md**](docs/memory.md) : Spécifications du système de mémoire multicouche en fichiers `.txt` (Core, 30 jours, Archives, Compétences).
* 🎭 [**plugin.md**](docs/plugin.md) : Spécifications de l'incarnation visuelle/audio, du passage d'OpenLLMVTuber à l'interface VRM et du TTS.

---

## 🛠️ Stack Technique

* **Langage :** Python 3.11+
* **Interface / Rendu :** Moteur VRM 3D / Overlay Desktop Pet (Tauri + Three.js)
* **Inférence LLM :** LM Studio / Ollama / llama.cpp (Modèles recommandés : Gemma 4 12B / E4B)
* **Protocole d'outils :** MCP (Model Context Protocol)
* **Audio :** Fast-Whisper (STT) & Edge-TTS / Kokoro (TTS)
* **Stockage Mémoire :** Fichiers Texte Brut (`.txt`) pour une portabilité totale.
