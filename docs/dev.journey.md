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

### 👁️ Vivacité de l'Avatar : Le Clignement d'Yeux (Blink)
Pour rendre l'avatar 3D VRM véritablement "vivant" sans surcharger le CPU, un système de **clignement d'yeux naturel et aléatoire** a été intégré au moteur Three.js / VRM. L'avatar ne reste plus figé entre deux phrases : il respire et cligne des yeux de manière organique.

### ⚙️ Le Tiroir d'Options Dynamiques (Options UI)
Fini de modifier des fichiers de configuration `.env` ou `.json` à la main et de relancer les serveurs :
- **Sélection du moteur TTS à chaud :** Bascule instantanée entre Edge-TTS et Piper TTS direct dans l'UI.
- **Sélection de la voix & de la langue :** Menu déroulant dynamique alimenté par le backend.
- **Paramétrage du LLM :** Changement du modèle `.gguf`, contrôle de la taille de contexte (4k à 131k tokens) et réglage du nombre de messages réinjectés dans la fenêtre glissante.

  <img width="1369" height="890" alt="Capture d&#39;écran 2026-08-09 195450" src="https://github.com/user-attachments/assets/3176631e-c38f-4c4d-979c-0405f4975493" />


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
| Avatar 3D VRM + Clignement d'yeux | ✅ Fonctionnel |
| Changement de VRM & Fond | ✅ Fonctionnel |
| Options UI (Paramètres à chaud) | ✅ Fonctionnelles |
| Synthèse Vocale Piper TTS (Local) | ✅ Intégré & Rapide |
| Synthèse Vocale Edge-TTS (Cloud) | ✅ Fonctionnel |
| Kokoro TTS | ❌ Abandonné (Instable/Complexité) |
| Historique des conversations | ✅ Stable |
| Reprise / Suppression des conversations | ✅ Fonctionnelle |
| Connexion au Hub MCP | ✅ Fonctionnelle |
| Indicateur de connexion des outils | ✅ Fonctionnel |
| DeepSearch / Memory / Auto-Learning | ✅ Fonctionnels |

---

## 🧭 La suite : Stabilisation & Packaging (Roadmap V1.0)

La base fonctionnelle est désormais **solide et éprouvée**. L'objectif n'est plus d'ajouter frénétiquement des fonctionnalités, mais de stabiliser et packager cette V1.0.

### 🗺️ Piliers de la V1.0

┌─────────────────────────────────────────────────────────┐
│                  APPLICATION MAYA V1.0                  │
├─────────────────────────────────────────────────────────┤
│  ✅ Interface propriétaire complète                      │
│  ✅ Moteur 3D VRM (Blink + Expressions)                 │
│  ✅ Options UI dynamique (Moteurs TTS, Contexte, LLM)    │
│  ✅ Synthèse vocale Piper (Local) & Edge-TTS            │
│  ✅ Historique des conversations & Sessions             │
│  ✅ Hub MCP (DeepSearch, Memory, Auto-Learning)         │
│  ✅ Indicateur d'état des services                      │
│  ─────────────────────────────────────────────────────  │
│  ⬜ Stabilisation globale & nettoyage du code           │
│  ⬜ Packaging autonome (.exe / Tauri Standalone)        │
│  ⬜ Script/Launcher unique de démarrage                 │
│  ⬜ Mode Overlay / Desktop Pet                          │
│  ⬜ Synchronisation Cross-Device (PC / Smartphone)      │
└─────────────────────────────────────────────────────────┘
