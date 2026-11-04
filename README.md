<img width="64" height="64" alt="64x64" src="https://github.com/user-attachments/assets/b7d6eea8-9342-4ac9-9b7b-4e0a314fcb01" /> **Project M.A.Y.A.**

> **M**odular **A**vatar & **Y**oked **A**gent  
> Built on the **M.A.Y.A.** principle : **M**ost **A**dvanced, **Y**et **A**cceptable

**Maya** est un compagnon IA **100 % local**, incarné (avatar VRM + voix), avec une mémoire multicouche qui évolue vraiment avec le temps.

---

### ⚠️ Point crucial — Mémoire

Pour que Maya se souvienne de vous sur le long terme, **cliquez sur l’icône disquette** à la fin de chaque session.  
C’est cette accumulation de souvenirs qui alimente le cycle de réflexion (tous les 7 jours) et enrichit progressivement le **Core** de Maya.

→ [Comment fonctionne la mémoire](docs/memory.md) · [FAQ Utilisateur](Maya_FAQ_Utilisateur.pdf)

---

## 🎬 Présentation du projet

Découvrez M.A.Y.A. en vidéo — un compagnon IA local incarné, avec mémoire multicouche et outils modulaires.

https://github.com/user-attachments/assets/e5225b2f-67a3-4a25-b4a1-f3c50d88b0cf

---

# 🖥️ État actuel — Maya v1.4

Maya est une **application native Windows** (Tauri) avec installateur clé en main.

### Ce qu’elle offre aujourd’hui

- Avatar VRM (clignement d’yeux, expressions dynamiques, animations, blush)
- Mode **Desktop Pet / Overlay** (fenêtre transparente, clics traversants, toujours au premier plan)
- Mémoire multicouche avancée (moments forts, émotions dynamiques, journal optimisé)
- **Système de compétences** (connaissances structurées avec niveau de confiance + triggers)
- **Ingestion de documents** (PDF / DOCX → compétence permanente)
- Mini-chat overlay réductible / masquable
- Espace de discussion modulable
- Indicateurs visuels en temps réel (Hub, LLM, TTS, STT)
- Moteur vocal hybride (Piper TTS local + Edge-TTS) + STT amélioré
- Modes **Actif / Passif**
- Jeux intégrés jouables avec Maya
- Historique des conversations + Options UI dynamiques
- Hub central (DeepSearch, FileSystem, MEMORY, Auto-Learning, Timer…)

### Interface Maya (mode classique)

<img width="1247" height="845" alt="interface" src="https://github.com/user-attachments/assets/f4d62f36-2163-413c-ad61-afd6135b2853" />

### Mode Desktop Pet (Overlay)

<img width="610" height="963" alt="overlay" src="https://github.com/user-attachments/assets/75944093-786f-4c72-97d9-0e97775f20e4" />

### Maya Hub

Le **Maya Hub** reste la couche centrale (DeepSearch, FileSystem, MEMORY, Auto-Learning, **Timer**).

<img width="1041" height="815" alt="hub" src="https://github.com/user-attachments/assets/cb2769f7-59ba-4af7-ac5e-2e5d2b69560a" />

---

#### ⚡ Prise en main rapide — Utiliser les nouveautés de la v1.4

##### 1. 🧠 Le nouveau journal de mémoire

* **Utilisation au quotidien** : Vos moments forts et événements marquants s'enregistrent proprement au fil de la journée.
* **Mise à jour des émotions** : Les états émotionnels se réécrivent dynamiquement pour éviter toute accumulation de doublons.
* **Bonne pratique** : Cliquez sur l'icône **Disquette** en fin de session (au minimum une fois par jour d'utilisation). Le journal épuré optimise la fenêtre de contexte sans saturer la mémoire.

##### 2. 🎓 Le système de compétences (`skills.json`)

* **Connaissances structurées** : Maya conserve ses savoirs permanents dans un fichier dédié, avec niveau de confiance et déclencheurs (*triggers*) ciblés.
* **Injection discrète** : Lorsqu'un sujet connu est abordé, la compétence s'active en arrière-plan sans polluer ni alourdir l'historique du chat.
* **Personnalisation** : Vous pouvez consulter ou ajuster les compétences directement dans le fichier de configuration.

##### 3. 📄 Ingestion directe de documents (PDF & DOCX)

* **Mode d'emploi** : Cliquez sur l'icône **trombone**, puis sélectionnez un fichier `.pdf` ou `.docx`.
* **Apprentissage & réponse** : Maya lit le document, le transforme automatiquement en compétence permanente et peut répondre immédiatement à vos questions.
* **Propreté du système** : Le document brut ne reste ni dans l'historique de discussion ni dans le journal.

---

## 📦 Installation

1. Télécharge le dernier `setup.exe` dans les **[Releases](https://github.com/IronWoodten/project-maya/releases/latest)**
2. Clique droit → **Exécuter en tant qu’administrateur**
3. Installe de préférence dans ton dossier utilisateur (ex: `AppData`) plutôt que dans `Program Files`
4. Place tes modèles `.gguf` dans le dossier prévu, puis sélectionne-les dans les Options → **Cerveau**

---

## 📅 Changelog récent

### Maya 1.4
- Nouveau système de mémoire : moments forts propres + émotions qui se mettent à jour (plus d’accumulation)
- Journal nettement plus lisible et économe en contexte
- Système de compétences (`skills.json`) avec injection discrète
- Ingestion de documents (PDF/DOCX → compétence permanente, discussion directe possible)

### Maya 1.3
- Indicateurs visuels (diodes verte / rouge) pour Hub, LLM, TTS et STT
- Espace chat modulable (agrandir / réduire)

### Maya 1.2
- Mémoire renforcée avec journal mensuel réinjecté
- Meilleure compréhension des images
- Réponses plus rapides
- Correction d’un bug de freeze
- Mini-chat en overlay réductible ou masquable
- Nouvelle icône Jeu + 3 jeux jouables avec l’IA
- TTS et STT améliorés

---

# 📌 Pourquoi ce projet ?

Le projet **M.A.Y.A.** est né d’un constat d’insatisfaction face aux assistants IA commerciaux au début de l’année 2026.

L’objectif était de concevoir un véritable compagnon IA capable d’évoluer dans le temps tout en restant entièrement local.

### Les limites observées

**🧠 Perte de contexte**  
Même avec de très larges fenêtres de contexte, les assistants finissent par oublier la personnalité, les habitudes et les informations importantes accumulées au fil des jours.

**💬 Style de réponse rigide**  
Les réponses deviennent souvent trop longues, trop formatées, répétitives et peu naturelles.

**🔒 Contrôle & Vie privée**  
L’objectif était de construire un assistant entièrement local, totalement personnalisable et indépendant des services SaaS.

---

# ✨ Fonctionnalités clés

## 🎭 Incarnation visuelle

- Avatar VRM interactif avec **clignement d’yeux naturel (Blink)**
- Changement dynamique de modèle VRM
- Personnalisation des fonds d’écran
- Expressions faciales et blendshapes (ARKit / VRM) en fonction du contexte

| Joyeuse 😊 | Triste 😢 | En colère 😡 |
|:----------:|:---------:|:------------:|

<img width="402" height="442" alt="Capture d'écran 2026-08-16 200636" src="https://github.com/user-attachments/assets/5e4bddba-04ba-4065-ba02-482aeeca1c14" /> <img width="463" height="360" alt="Capture d'écran 2026-08-16 200845" src="https://github.com/user-attachments/assets/01e60b2d-cf94-49f0-a832-bfae6e4b862f" /> <img width="451" height="419" alt="Capture d'écran 2026-08-16 200921" src="https://github.com/user-attachments/assets/858ea24b-1b1b-4593-8c33-22342e35cf6a" />

## 🎙️ Moteur vocal hybride (TTS / STT)

- **Edge-TTS** : voix cloud haute qualité
- **Piper TTS** : moteur TTS local ultrarapide, léger et réactif
- **Speech-to-Text** : intégration STT pour le contrôle vocal
- Pipeline audio modulaire débrayable à tout moment

> **Note :** Kokoro TTS a été abandonné suite à sa complexité d’installation et à son manque de stabilité.

## ⚙️ Configuration centralisée (Options UI)

L’interface dispose d’un tiroir de paramètres modulaire et catégorisé, permettant de tout configurer à la volée :

<img width="1042" height="790" alt="options" src="https://github.com/user-attachments/assets/e33ae2c1-166e-43ab-ab0f-2c92192583fa" />

### 🏠 Hub Central
* **Accès direct (Port 5005)** : bouton de redirection rapide vers l’interface de gestion du Hub Maya.

### 🧠 LLM / Cerveau

<img width="1053" height="765" alt="Capture d’écran 2026-08-14 121319" src="https://github.com/user-attachments/assets/5aca1aa2-7e81-4d1d-987a-35cafd582e03" />

* Organisation par dossiers : chaque modèle LLM vit dans son propre sous-dossier avec son fichier vision (`mmproj`) associé
* Association automatique LLM ↔ Vision
* Couplage strict dans l’UI
* Affichage multi-quantisation

### 🎙️ Voix & Synthèse

<img width="1049" height="796" alt="options voix" src="https://github.com/user-attachments/assets/92873116-c31c-4a7c-afd0-193c8936d8c0" />

* Choix dynamique entre Edge-TTS et Piper TTS
* Filtrage intelligent des voix selon le moteur

### 📝 System Prompt & Deepsearch

<img width="1019" height="781" alt="Capture d’écran 2026-08-14 121445" src="https://github.com/user-attachments/assets/d01facc6-b2e2-451d-a0d6-ebf24395bf42" />

* Édition en direct du System Prompt
* Recherche web autonome (clé Tavily personnalisable)

### ⚡ Mode Actif / Passif

<img width="1041" height="771" alt="option proactif" src="https://github.com/user-attachments/assets/e76a4868-7145-4a20-b1b0-b4e25caa7d46" />

* Mode **Passif** (répond uniquement aux sollicitations) ou **Actif** (relances autonomes)
* Délai d’inactivité réglable

## 💬 Gestion des conversations

- Enregistrement des sessions
- Historique complet avec prévisualisation et suppression
- Reprise de n’importe quelle ancienne discussion

## 🔌 Hub Central & Plugins

- Architecture MCP + Dashboard Web
- **DeepSearch** : recherche web autonome multicouche
- **Plugin MEMORY** : base de connaissances techniques
- **Auto-Learning** régulé (cycle de 20 min + timer en temps réel)
- **FileSystemPlugin** : gestion de fichiers (avec liste noire de sécurité)
- **Timer** : minuteur autonome avec notification et réaction vocale de Maya

---

# 🏗️ Architecture globale

```
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
│  • FileSystemPlugin                                     │
│  • Plugin MEMORY                                        │
│  • Auto-Learning                                        │
│  • Filtre Sémantique                                    │
│  • Timer                                                │
└────────────────────────────┬────────────────────────────┘
                             │
                  Réponse enrichie + Actions
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  4. Interface & Incarnation             │
│  Avatar VRM (Blink + Expressions + Animations)          │
│  Mode Overlay / Desktop Pet (Tauri)                     │
│  Piper/Edge TTS • Options UI • Modes Actif/Passif       │
└─────────────────────────────────────────────────────────┘
```

---

# 🧠 Évolution du système de mémoire

L’un des principaux défis d’un compagnon IA local est de conserver un historique sur le long terme sans saturer la fenêtre de contexte.

### V1 — Journal manuel
Une commande `/save` permettait au LLM de résumer la journée dans un fichier texte réinjecté au prompt système.

### V2 — Mémoire multicouche auto-évolutive
La mémoire est séparée en plusieurs couches :
- 📄 **Journal récent** : interactions quotidiennes
- 📚 **Journal d’archives** : transfert automatique des anciennes entrées
- 🧬 **Core de personnalité** : identité profonde de Maya
- 📈 **Auto-évolution** : compétences et connaissances acquises

### Aujourd’hui (v1.4)
- Moments forts ajoutés proprement
- Émotions mises à jour dynamiquement (plus d’accumulation)
- Journal optimisé et économe en contexte
- Système de compétences structuré (`skills.json`)
- Ingestion de documents (PDF/DOCX → compétence permanente)

---

# 🚀 Historique du développement

```
[LM Studio + Anything]
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
```

<details>
<summary><strong>Voir le détail des phases de développement</strong></summary>

### Phase 1 — Les bases
Premières expérimentations avec **LM Studio** et **Anything**.

### Phase 2 — L’incarnation
Migration vers **SillyTavern**, puis **OpenLLMVTuber**.

### Phase 3 — Modularité & Hub Central
Développement du **Maya Hub**.

### Phase 4 — Interface propriétaire & Refonte Vocale
Développement de l’interface dédiée + intégration de Piper TTS.

### Phase 5 — Native App & Desktop Pet (Août 2026)
Migration vers **Tauri**, mode Overlay, stabilisation complète.

#### Phase 5.1 — Stabilisation Overlay & Alpha (20-24 août 2026)
Corrections Overlay, intégration de la vraie mémoire, 4 VRM de base, début de la phase Alpha.

#### Phase 5.2 — Solidification des fondations (25-28 août 2026)
Correctifs critiques (historique, stop tokens, animations, mémoire V3, architecture LLM/Vision).

#### Phase 5.3 — Fluidité, sécurité & packaging (29 août – 4 septembre 2026)
Slider voix, animations fluides, interruption naturelle, protection FileSystem, packaging `.exe` + installateur (v1.0.0).

</details>

> **PS :** Jusqu’à la v1.0, **100 % du projet** a été développé dans le **Bloc-notes Windows**.  
> Oui, le vrai. Non, ce n’est pas une blague. 📝🔥

---

# 📚 Documentation

La documentation technique détaillée est accessible dans le dossier [`docs`](./docs/) :

- [**`dev.journey.md`**](./docs/dev.journey.md) — Historique du projet, arbitrages techniques et roadmap
- [**`hub.md`**](./docs/hub.md) — Architecture du Hub MCP, DeepSearch et Auto-Learning
- [**`memory.md`**](./docs/memory.md) — Gestion de la mémoire multicouche et du Core
- [**`plugin.md`**](./docs/plugin.md) — Moteur VRM, Piper TTS, STT et interface utilisateur
- [**`timer.md`**](./docs/timer.md) — Plugin Timer : fenêtre autonome, notification différée et réaction vocale de Maya

---

# 🛠️ Stack Technique

| **Domaine**              | **Technologies**                                          |
|--------------------------|-----------------------------------------------------------|
| **Langage**              | Python 3.11+ · JavaScript (ES6 Modules)                   |
| **Backend Hub**          | Flask · MCP Protocol                                      |
| **Interface / Avatar**   | Three.js · `@pixiv/three-vrm` · HTML5 / CSS3 (Dark Theme) |
| **LLM Moteur**           | llama.cpp                                                 |
| **Text-to-Speech (TTS)** | **Piper TTS** (Local) · **Edge-TTS** (Cloud)              |
| **Speech-to-Text (STT)** | Fast-Whisper                                              |
| **Mémoire & Config**     | Fichiers JSON · `.txt`                                    |
| **Framework Desktop**    | Tauri (Rust)                                              |

---

# 🔮 Roadmap

**Fait :**
- ✅ Packaging standalone (`.exe` + setup installateur)
- ✅ Plugin Timer
- ✅ Système de compétences
- ✅ Ingestion de documents
- ✅ Indicateurs visuels & chat modulable
- ✅ Jeux intégrés

**Prochaines étapes :**
- 🔌 Nouveaux plugins pour le Maya Hub
- ✨ Améliorations continues de la mémoire et de l’expérience utilisateur

---

# 📜 License

Ce projet est distribué sous la licence **[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)**.

- Vous pouvez utiliser, modifier et redistribuer Maya librement  
- **Usage commercial interdit** (vente, rebranding, monétisation, etc.)
- Le code source reste accessible

Voir le fichier [`LICENSE`](./LICENSE) pour le texte complet.

---

# ⚠️ Avertissement sécurité

> Maya dispose d’outils (notamment le **FileSystemPlugin**) qui peuvent **lire, écrire, déplacer, renommer et supprimer** des fichiers sur votre machine.
>
> Même avec une liste noire sur certains dossiers système critiques, l’utilisation comporte des risques réels.
>
> **Recommandations :**
> - Utilisez Maya de préférence sur une machine de test ou avec des sauvegardes à jour
> - Désactivez le FileSystemPlugin si vous n’en avez pas besoin
> - Ne donnez jamais d’instructions ambiguës concernant des fichiers ou dossiers sensibles
>
> Vous êtes seul responsable de l’utilisation des outils système de Maya.

---

# 📌 Projet

**M.A.Y.A. — Modular Avatar & Yoked Agent**

*Un assistant IA local, modulaire, incarné et conçu pour évoluer dans le temps.*

> **M**ost **A**dvanced, **Y**et **A**cceptable.
```
