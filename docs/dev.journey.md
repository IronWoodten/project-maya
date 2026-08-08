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

## 🏆 La Victoire Majeure : Le Hub Central MCP

Pendant longtemps, chaque ajout d'outil était une petite bataille. **L'émergence du Hub Central MCP a été LA plus grande victoire technique du projet.**

Dès l'instant où le Hub a été opérationnel :

- La gestion des fonctions est devenue "Plug & Play".
- Ajouter, tester ou retirer un module ne risquait plus de casser l'interface ou la mémoire.
- La charge mentale liée au code s'est effondrée, laissant la place à la création d'outils métier (lumières WiZ, DeepSearch, apprentissage autonome).

Le Hub est désormais une brique centrale fonctionnelle de Maya. Les outils qui y sont intégrés peuvent être utilisés par l'interface sans dépendre directement de leur implémentation interne.

---

## 🚀 L'Évolution Majeure : L'Interface Propriétaire

L'une des évolutions les plus importantes du projet a été l'abandon progressif de la dépendance à OpenLLMVTuber au profit d'une **interface propriétaire développée spécifiquement pour Maya**.

Cette interface a maintenant dépassé le stade de prototype et constitue une base fonctionnelle du projet.

### 🖥️ Interface actuelle

Les principales briques de l'interface sont désormais opérationnelles :

- **Avatar 3D VRM fonctionnel**, avec possibilité de changer de modèle.
- **Arrière-plan personnalisable**, permettant de modifier le décor de l'interface.
- **Synthèse vocale (TTS)** intégrée et fonctionnelle.
- **Historique des conversations** stable.
- Reprise d'anciennes conversations directement depuis l'historique.
- Suppression des conversations précédentes.
- **Indicateur de connexion aux outils**, sous la forme d'une pastille verte/rouge permettant de visualiser rapidement leur état.
- Communication avec les outils du Hub fonctionnelle.

L'interface ne constitue donc plus uniquement une démonstration visuelle : elle forme désormais un véritable client utilisable pour Maya.

### 📸 Aperçu de l'interface actuelle

<img width="925" height="764" alt="image" src="https://github.com/user-attachments/assets/99ff4d7a-1198-4c3a-844e-752e9b255a1c" />

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

## 🎯 État actuel du projet

Le projet a maintenant franchi plusieurs étapes qui étaient initialement prévues comme des objectifs de la V1.

| Fonctionnalité | État |
|---|---|
| Interface propriétaire | ✅ Fonctionnelle |
| Avatar 3D VRM | ✅ Fonctionnel |
| Changement de VRM | ✅ Fonctionnel |
| Changement de fond | ✅ Fonctionnel |
| TTS | ✅ Fonctionnel |
| Historique des conversations | ✅ Stable |
| Reprise d'anciennes conversations | ✅ Fonctionnelle |
| Suppression des conversations | ✅ Fonctionnelle |
| Connexion au Hub | ✅ Fonctionnelle |
| Indicateur de connexion des outils | ✅ Fonctionnel |
| Outils du Hub | ✅ Fonctionnels |

Maya n'est donc plus dans une phase de recherche de solution pour son interface principale.

**La base fonctionnelle existe désormais.**

La priorité évolue progressivement de la construction des briques fondamentales vers leur stabilisation, leur intégration et leur packaging.

---

## 🧭 La difficulté actuelle : savoir s'arrêter

Le plus grand défi du projet n'est désormais plus de prouver que les différentes briques peuvent fonctionner, mais de **savoir quand arrêter d'ajouter de nouvelles fonctionnalités afin de stabiliser une version cohérente**.

L'objectif n'est pas de créer immédiatement une IA capable de tout faire.

L'objectif est d'abord de disposer d'une **Maya V1 stable, utilisable et reproductible**.

### 🗺️ Piliers de la V1.0

```text
┌─────────────────────────────────────────────────────────┐
│                 APPLICATION MAYA V1.0                   │
├─────────────────────────────────────────────────────────┤
│  ✅ Interface propriétaire                              │
│  ✅ Moteur 3D VRM                                      │
│  ✅ Changement de VRM                                   │
│  ✅ Arrière-plan personnalisable                       │
│  ✅ TTS                                                 │
│  ✅ Historique des conversations                        │
│  ✅ Hub MCP fonctionnel                                 │
│  ✅ Connexion aux outils visible                        │
│  ─────────────────────────────────────────────────────  │
│  ⬜ Stabilisation / finalisation                        │
│  ⬜ Packaging autonome (.exe)                           │
│  ⬜ Lancement simplifié des différents services         │
│  ⬜ Mode Overlay / Desktop Pet                          │
│  ⬜ Synchronisation Cross-Device (PC / Smartphone)      │
└─────────────────────────────────────────────────────────┘
