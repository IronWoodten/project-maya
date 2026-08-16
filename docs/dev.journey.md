Markdown

# 🛠️ Journal de Bord & Vision (Dev Journey) — Maya

## 📜 Genèse & Leçons Apprises (Le Parallèle des Solutions Existantes)

Le développement de Maya n'a pas commencé sur une feuille blanche, mais est né d'une frustration face aux outils d'IA locaux existants.

### 1. L'Expérimentation SillyTavern : Le piège de la lourdeur

SillyTavern a d'abord semblé être la solution idéale pour donner une "âme" et un corps au LLM. Cependant, au fur et à mesure de l'ajout de briques complémentaires (connexion à Kokoro pour la synthèse vocale, ComfyUI pour la génération d'images, etc.), l'écosystème est devenu ingérable :

- **Départ laborieux :** Multiplication des fenêtres d'invite de commande (`cmd`) ouvertes au lancement.
- **Prolifération de plugins :** Complexité de maintenance et lenteur excessive au démarrage de la machine.

### 2. Le Test d'Alternatives Closes (ex: Amica)

Plusieurs alternatives légères comme Amica ont été testées. Si elles réglaient le problème de légèreté, elles souffraient d'un défaut inverse : **des architectures trop fermées**, empêchant la personnalisation à bas niveau et l'injection de mécanismes maison comme la mémoire multicouche.

### 3. La Découverte d'OpenLLMVTuber & les Premières "Erreurs de Parcours"

OpenLLMVTuber a représenté un véritable tournant : une base modulaire, légère, nativement pensée pour l'incarnation et proposant ce fameux mode *Overlay* ("Desktop Pet").

Cependant, la personnalisation de cet outil a apporté son lot de difficultés :

- **Casse de fichiers clés :** Plusieurs erreurs de manipulation ont parfois détruit des fichiers d'intégration d'outils critiques, nécessitant des retours en arrière.
- **Complexité Live2D :** La gestion et le remplacement des modèles Live2D dans OpenLLMVTuber s'est révélée exagérément complexe et rigide.

---

## 🎙️ La Saga Vocal TTS : De l'Enfer Kokoro à la Libération Piper TTS

L'intégration d'une synthèse vocale locale haute qualité a été l'un des parcours les plus chaotiques du projet.

### 🔴 Le Calvaire Kokoro TTS (L'Impasse Technique)
Sur le papier, **Kokoro TTS** promettait une qualité vocale impressionnante pour un modèle local. En pratique, sa mise en œuvre s'est transformée en un véritable cauchemar d'ingénierie :
- **Dépendances brisées & Fichiers corrompus :** Problèmes incessants de compatibilité d'environnements Python, conflits d'ABI avec PyTorch/ONNX, et poids de paquets démesuré.
- **Liens morts & Modèles introuvables :** Lors de la configuration des voix et poids du modèle, confrontation à des dépôts incomplets, des URL mortes et des téléchargements corrompus.
- **Instabilité au déploiement :** Même quand le service démarrait, les temps de génération subissaient des latences imprévisibles et des plantages aléatoires du processus audio.

**Décision :** Abandon pur et simple de Kokoro. Une brique logicielle qui nécessite 3 heures d'installation fragile n'a pas sa place dans la philosophie *M.A.Y.A.*.

### 🟢 La Révélation Piper TTS (Le Choix Gagnant)
Après l'échec de Kokoro, le pivot s'est fait vers **Piper TTS**... et la différence a été radicale :
- **Installation instantanée :** Exécutable ultra-léger, zéro dépendance lourde PyTorch.
- **Génération ultra-rapide :** Synthèse vocale fluide en quelques millisecondes sur CPU/GPU local.
- **Voix naturelles & Légèreté :** Les modèles ONNX légers de Piper offrent un compromis parfait entre intelligibilité, ton naturel et consommation de ressources.

Aujourd'hui, Maya dispose d'un **système vocal hybride parfait** : **Edge-TTS** (cloud très fluide) et **Piper TTS** (100 % local, autonome et rapide).

---

## 🏆 La Victoire Majeure : Le Hub Central MCP

Pendant longtemps, chaque ajout d'outil était une petite bataille. **L'émergence du Hub Central MCP a été LA plus grande victoire technique du projet.**

Dès l'instant où le Hub a été operational :

- La gestion des fonctions est devenue "Plug & Play".
- Ajouter, tester ou retirer un module ne risquait plus de casser l'interface ou la mémoire.
- La charge mentale liée au code s'est effondrée, laissant la place à la création d'outils métier (lumières WiZ, DeepSearch, apprentissage autonome).

Le Hub est désormais une brique centrale fonctionnelle de Maya. Les outils qui y sont intégrés peuvent être utilisés par l'interface sans dépendre directement de leur implémentation interne.

---

## 🚀 L'Évolution Majeure : L'Interface Propriétaire & Incarnation 

L'une des évolutions les plus importantes du projet a été l'abandon progressif de la dépendance à OpenLLMVTuber au profit d'une **interface propriétaire développée spécifiquement pour Maya**.

Cette interface a dépassé le stade de prototype pour devenir une application complète, réactive et hautement personnalisable.

### 🎭 Menu Contextuel & Animations VRM Dynamiques
L'incarnation passe aussi par le contrôle direct : un menu contextuel (clic droit) permet désormais de déclencher instantanément toute la palette d'animations VRM (`nod`, `think`, `deny`, `kiss`, `dance`, etc.). Le moteur d'animation intègre un résolveur d'alias pour garantir la compatibilité des commandes entre le chat, le menu et le script VRM.

### 👁️ Correction Vision & Détection Automatique MMPROJ
À la suite des travaux sur la brique de vision, le système intègre désormais un champ avec **détection automatique du modèle `mmproj`**. Cela résout les échecs d'association entre le modèle LLM GGUF et son projecteur visuel.

### 🔑 Clé API Tavily Personnalisée (Options UI)
Le panneau de configuration DeepSearch a été enrichi d'un champ dédié à la clé API Tavily. Chaque utilisateur peut ainsi renseigner sa propre clé directement depuis l'interface sans toucher aux fichiers de variable d'environnement backend.

### ⏱️ Contrôle d'Activité & Timer Auto-Learning
Le système d'Auto-Learning a été affiné : plutôt que de se lancer aveuglément toutes les 20 minutes, il vérifie désormais si une interaction réelle a eu lieu avec l'IA dans cette fenêtre de temps. De plus, un **compte à rebours en temps réel** est affiché directement sur le Hub.

### 👁️ Vivacité de l'Avatar : Le Clignement d'Yeux (Blink)
Pour rendre l'avatar 3D VRM véritablement "vivant" sans surcharger le CPU, un système de **clignement d'yeux naturel et aléatoire** a été intégré au moteur Three.js / VRM. L'avatar ne reste plus figé entre deux phrases : il respire et cligne des yeux de manière organique.

### 🎭 Expressivité & Émotions : Expressions Faciales et Blush
L'incarnation ne s'arrête pas aux mouvements passifs : Maya est désormais dotée d'un système d'expressions faciales dynamiques (joie, surprise, réflexion...) couplé à la gestion du **blush** (rougissement). Ces réactions visuelles ajustent les *blendshapes* du modèle VRM en temps réel selon le contexte de la réponse, rendant les interactions visuellement vivantes et nettement plus incarnées.

### ⚙️ Refonte de l'Options UI : L'Architecture Modulaire par Catégories

Face à l'accumulation des paramètres (choix du LLM, contexte, moteurs vocaux, prompts...), l'ancien panneau unique sous forme de long formulaire devenait trop dense et difficile à naviguer. L'interface des paramètres a donc subi une **refonte ergonomique complète** basée sur un système de tiroir modulaire à sous-panneaux :

- **Menu Racine Simplifié :** Le tiroir s'ouvre désormais sur une vue épurée listant 5 grandes catégories distinctes, accompagnées d'animations de transition fluides en CSS.
- **Lien Direct avec le Hub Central :** Intégration d'un bouton d'accès rapide ouvrant directement le serveur du Hub (Port 5005) dans un nouvel onglet.
- **Panneaux Superposés Dédiés :**
  - 🧠 **LLM / Cerveau :** Détection à chaud des modèles `.gguf` locaux, ajustement du contexte serveur (4k à 131k) et contrôle de la mémoire glissante.
  - 🎙️ **Voix & Synthèse :** Filtrage intelligent des voix et langues selon le moteur choisi (Edge-TTS ou Piper TTS local).
  - 📝 **System Prompt & DeepSearch :** Édition en direct de la personnalité de Maya et des objectifs de veille autonome (`goals.json`).
  - ⚡ **Mode Actif / Passif :** Nouvelle gestion de l'interaction permettant de basculer entre le mode réactif classique et le mode proactif avec gestion du délai d'inactivité.
- **Sauvegarde Unifiée par API Backend :** Remplacement total des Stockages Locaux navigateur (`localStorage`) au profit d'endpoints serveur dédiés (`/api/config` et `/api/goals`), garantissant une persistance réseau et cross-device parfaite.

### 🖥️ Synthèse des capacités de l'interface

- **Avatar 3D VRM animé** avec gestion des expressions et clignement d'yeux naturel.
- **Options UI intégrées** pour tout régler à chaud sans redémarrer.
- **Arrière-plan personnalisable** (images/décors).
- **Moteur vocal hybride** (Edge-TTS / Piper TTS local).
- **Gestionnaire de conversations** (sauvegarde, reprise, suppression de sessions).
- **Indicateur de connexion au Hub (pastille 🟢/🔴)** pour un suivi visuel direct des services.

### 📸 Aperçu de l'interface actuelle

<img width="819" height="899" alt="Capture d&#39;écran 2026-08-09 200059" src="https://github.com/user-attachments/assets/5b72a2db-67ee-46f4-b08c-4f82344e4770" />


---

## 🔌 État actuel du Hub & des outils

Le Hub Central est actuellement opérationnel et constitue la couche de communication entre Maya et ses différents outils.

Les outils actuellement intégrés ont été testés et sont **fonctionnels**.

L'interface Maya dispose également d'un retour visuel permettant de savoir si la connexion aux outils est active :

- 🟢 **Vert :** connexion aux outils opérationnelle.
- 🔴 **Rouge :** connexion aux outils indisponible.

Cette évolution apporte un élément important pour la fiabilité de l'application : l'utilisateur peut désormais identifier immédiatement l'état de la couche outils sans devoir consulter les logs du Hub.

### 📸 Aperçu du Hub actuel

<img width="794" height="754" alt="image" src="https://github.com/user-attachments/assets/21748efc-a569-4b96-bac9-1b642e6570bf" />

---

## 🎉 Le "Point de Bascule" : La Réussite Absolue

Après les bugs de code, les dépendances corrompues, les liens mort-nés de Kokoro et les errances d'architecture, **nous y sommes**. 

Toutes les briques (Avatar 3D, Clignement d'yeux, Piper TTS local, Options UI, Hub MCP, Mémoire multicouche et Auto-Learning) communiquent désormais en parfaite harmonie. Le système est fluide, réactif et 100 % sous contrôle.

---

## 🎯 État actuel du projet

| Fonctionnalité | État |
|---|---|
| Interface propriétaire | ✅ Fonctionnelle |
| Avatar 3D VRM + Clignement & Animations (Clic Droit) | ✅ Fonctionnel |
| Vision multimodal + Détection auto `mmproj` | ✅ Fonctionnel |
| Options UI (5 panneaux + Clé Tavily custom) | ✅ Fonctionnelles |
| Synthèse Vocale Piper TTS (Local) & Edge-TTS | ✅ Intégré & Rapide |
| Historique & Gestion des conversations | ✅ Fonctionnel |
| Connexion au Hub MCP & Indicateur d'état (🟢/🔴) | ✅ Fonctionnel |
| DeepSearch / Memory | ✅ Fonctionnels |
| Auto-Learning (Check 20 min d'échange + Timer Hub) | ✅ Opérationnel |

### 🆕 Août 2026 — Native & Overlay

- Migration Tauri validée (`tauri dev`)
- Mode Desktop Pet / Overlay opérationnel (hit-test dynamique + Z-Index + état atomique Rust)
- Animation « Assis » + timings corrigés
- Mémoire multicouche 100 % finalisée
- Modes Actif / Passif validés
- Correctifs post-migration (bouton Hub + macros Rust)

- ### 🆕 16 août 2026 — Stabilisation profonde du Hub & Plugins

Session intensive de 2h15 dédiée à la solidité et à la réactivité du Hub MCP.

**Core Hub & Infrastructure**
- Passage complet en **Async / HTTPX** → éradication des deadlocks HTTP sur le port 5005
- Temps de réponse des outils passé d’un timeout de 60s à ~1 ms
- Parsing universel des paramètres (chaînes texte, kwargs, JSON) + tolérance aux alias de clés (`src_path`/`dst`/`old_path`, `path`/`file`…)

**Plugins validés**
- **FileSystemPlugin** : cycle de vie complet des fichiers (write, read, move, list, delete) avec résolution intelligente vers le vrai Bureau utilisateur
- **ResearchPlugin** & **MemoryPlugin** : recherche web ultra-rapide + synchronisation mémoire en arrière-plan

**Interface & Avatar**
- Correction du bug de duplication des messages au basculement Overlay ↔ Normal
- Rétablissement de l’indicateur d’attente (« en réflexion ») dans le mode Overlay
- Ajout des postures d’idle (assise + debout) pour un comportement plus naturel

---

## 🧭 La suite : Stabilisation & Packaging (Roadmap V1.0)

La base fonctionnelle est désormais **solide et éprouvée**. L'objectif n'est plus d'ajouter frénétiquement des fonctionnalités, mais de stabiliser et packager cette V1.0.

### 🗺️ Piliers de la V1.0

```text
┌─────────────────────────────────────────────────────────┐
│                  APPLICATION MAYA V1.0                  │
├─────────────────────────────────────────────────────────┤
│  ✅ Interface propriétaire complète                     │
│  ✅ Moteur 3D VRM (Blink + Expressions)                 │
│  ✅ Options UI dynamique (Moteurs TTS, Contexte, LLM)   │
│  ✅ Synthèse vocale Piper (Local) & Edge-TTS            │
│  ✅ Historique des conversations & Sessions             │
│  ✅ Hub MCP (DeepSearch, Memory, Auto-Learning)         │
│  ✅ Indicateur d'état des services                      |
|  ✅ Options UI (5 panneaux) Opérationnel                |
|  ✅ Expressions faciales & Blush  Fonctionnels          |
│  ✅ Stabilisation globale & nettoyage du code           │
│  ─────────────────────────────────────────────────────  │
│  ⬜ Stabilisation globale & nettoyage du code           │
│  ⬜ Packaging autonome (.exe / Tauri Standalone)        │
│  ⬜ Script/Launcher unique de démarrage                 │
│  ⬜ Mode Overlay / Desktop Pet                          │
│  ⬜ Synchronisation Cross-Device (PC / Smartphone)      │
└─────────────────────────────────────────────────────────┘
