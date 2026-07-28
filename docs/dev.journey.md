# 🛠️ Journal de Bord & Vision (Dev Journey) — Maya

## 📜 Genèse & Leçons Apprises (Le Parallèle des Solutions Existantes)

Le développement de Maya n'a pas commencé sur une feuille blanche, mais est né d'une frustration face aux outils d'IA locaux existants.

### 1. L'Expérimentation SillyTavern : Le piège de la lourdeur
SillyTavern a d'abord semblé être la solution idéale pour donner une "âme" et un corps au LLM. Cependant, au fur et à mesure de l'ajout de briques complémentaires (connexion à Kokoro pour la synthèse vocale, ComfyUI pour la génération d'images, etc.), l'écosystème est devenu ingérable :
* **Départ laborieux :** Multiplication des fenêtres d'invite de commande (`cmd`) ouvertes au lancement.
* **Prolifération de plugins :** Complexité de maintenance et lenteur excessive au démarrage de la machine.

### 2. Le Test d'Alternatives Closes (ex: Amica)
Plusieurs alternatives légères comme Amica ont été testées. Si elles réglaient le problème de légèreté, elles souffraient d'un défaut inverse : **des architectures trop fermées**, empêchant la personnalisation à bas niveau et l'injection de mécanismes maison comme la mémoire multicouche.

### 3. La Découverte d'OpenLLMVTuber & les Premières "Erreurs de Parcours"
OpenLLMVTuber a représenté un véritable tournant : une base modulaire, légère, nativement pensée pour l'incarnation et proposant ce fameux mode *Overlay* ("Desktop Pet").

Cependant, la personnalisation de cet outil a apporté son lot de difficultés :
* **Casse de fichiers clés :** Plusieurs erreurs de manipulation ont parfois détruit des fichiers d'intégration d'outils critiques, nécessitant des retours en arrière.
* **Complexité Live2D :** La gestion et le remplacement des modèles Live2D dans OpenLLMVTuber s'est révélée exagérément complexe et rigide.

---

## 🏆 La Victoire Majeure : Le Hub Central MCP

Pendant longtemps, chaque ajout d'outil était une petite bataille. **L'émergence du Hub Central MCP a été LA plus grande victoire technique du projet.**

Dès l'instant où le Hub a été opérationnel :
* La gestion des fonctions est devenue "Plug & Play".
* Ajouter, tester ou retirer un module ne risquait plus de casser l'interface ou la mémoire.
* La charge mentale liée au code s'est effondrée, laissant la place à la création d'outils métier (lumières WiZ, DeepSearch, apprentissage autonome).

---

## 🎯 La Feat. La Plus Dure : "Savoir S'arrêter" (Roadmap V1.0)

Aujourd'hui, le plus grand défi technique du projet n'est plus d'ordre algorithmique, mais touche à la **discipline de livraison** : résister à la tentation permanente d'ajouter un nouvel outil pour enfin figer une version stable et la compiler en application autonome (`.exe`).

### 🗺️ Les Piliers de la Version 1.0 (L'Objectif Final)

```text
┌─────────────────────────────────────────────────────────┐
│                 APPLICATION MAYA V1.0                   │
├─────────────────────────────────────────────────────────┤
│  • Exécutable unique (.exe) sans fenêtres CMD           │
│  • Moteur 3D VRM avec import "Drag & Drop" simplifié     │
│  • Mode Overlay / Desktop Pet optimisé                   │
│  • Hub MCP figé + Mémoire Plain-Text (.txt)             │
│  • Synchronisation Cross-Device (PC / Smartphone)       │
└─────────────────────────────────────────────────────────┘
```

* **Interface Propriétaire & Moteur 3D VRM :** Remplacement d'OpenLLMVTuber et du Live2D par une interface sur-mesure permettant de changer de modèle 3D VRM en un glisser-déposer.
* **Packaging Tout-en-Un (.exe) :** Un seul fichier d'installation qui lance les services nécessaires en tâche de fond de manière transparente (sans empiler les fenêtres de terminal).
* **Pérennité des Données :** Conservation de la philosophie Plain-Text (`.txt`) pour permettre une synchronisation ultra-simple du journal de mémoire avec un smartphone.
