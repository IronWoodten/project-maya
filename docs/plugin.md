# 🎭 Spécifications de l'Interface & Incarnation — Maya

## 📐 Philosophie & Évolution de l'Interface

L'incarnation de Maya repose sur deux exigences majeures :

- **La fluidité d'interaction en temps réel**
- **Une présence visuelle personnalisable et non-intrusive**

Le projet a initialement utilisé **OpenLLMVTuber** comme base d'expérimentation. Cette architecture a permis de valider rapidement le concept d'un assistant incarné avec avatar, voix et interaction avec des outils externes.

Cependant, les limitations rencontrées avec OpenLLMVTuber et le système Live2D ont progressivement conduit au développement d'une **interface propriétaire dédiée à Maya**.

Cette interface constitue désormais le client principal du projet.

---

## 🔄 Évolution de l'architecture

### Architecture historique

La première version fonctionnelle reposait sur OpenLLMVTuber :

```text
[ Utilisateur ]
      │
      ▼
[ OpenLLMVTuber ]
      │
      ├── LLM
      ├── Mémoire
      ├── TTS
      ├── Outils
      └── Avatar Live2D
```

Cette architecture a permis de valider le concept de Maya mais présentait plusieurs limitations :

- dépendance importante à l'architecture d'OpenLLMVTuber ;
- personnalisation limitée de l'interface ;
- gestion complexe des modèles Live2D ;
- difficulté à faire évoluer l'interface indépendamment des autres composants.

### Architecture actuelle

L'interface propriétaire permet désormais de séparer clairement la présentation de Maya de ses différents services :

```text
                         ┌─────────────────────┐
                         │      INTERFACE      │
                         │    PROPRIÉTAIRE     │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
             ▼                      ▼                      ▼
       ┌───────────┐         ┌────────────┐         ┌─────────────┐
       │    VRM    │         │    TTS     │         │  Historique │
       │   Avatar  │         │   Vocal    │         │ Conversations│
       └───────────┘         └────────────┘         └─────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Pipeline Maya    │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
              ┌────────────┐               ┌─────────────┐
              │    LLM     │               │  Maya Hub   │
              │  Gemma 4   │               │    MCP      │
              └────────────┘               └──────┬──────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              │                   │                   │
                              ▼                   ▼                   ▼
                           [Outil]             [Outil]             [Outil]
```

Cette séparation permet à l'interface d'évoluer indépendamment du Hub et des outils.

---

# 🖥️ Interface Propriétaire

L'interface actuelle constitue désormais une véritable interface utilisateur fonctionnelle et non plus un simple prototype.

Elle prend notamment en charge :

- l'affichage de l'avatar VRM ;
- le changement de modèle VRM ;
- le changement d'arrière-plan ;
- l'affichage des conversations ;
- l'envoi et la réception des messages ;
- la synthèse vocale ;
- l'historique des conversations ;
- la reprise d'anciennes conversations ;
- la suppression des conversations ;
- l'affichage de l'état de connexion aux outils du Hub.

---

## 🧍 Avatar VRM

Le système d'incarnation utilise désormais le format **VRM** pour l'avatar 3D.

Le passage de Live2D à VRM permet notamment :

- une représentation 3D complète ;
- une plus grande liberté dans le choix des modèles ;
- la possibilité de changer facilement d'avatar ;
- une meilleure base pour les animations futures ;
- la possibilité d'intégrer ultérieurement des animations et interactions 3D plus poussées.

### Changement de modèle

Le système permet désormais de remplacer le modèle VRM utilisé par Maya sans modifier l'architecture de l'application.

L'avatar devient ainsi une ressource interchangeable plutôt qu'une partie figée de l'interface.

---

# 🎨 Arrière-plan

L'interface permet également de modifier l'arrière-plan utilisé derrière l'avatar.

Cette séparation entre :

- avatar ;
- arrière-plan ;
- interface utilisateur ;

permet de personnaliser l'apparence de Maya sans modifier son fonctionnement interne.

---

# 💬 Gestion des conversations

L'historique des conversations constitue désormais une fonctionnalité stable de l'interface.

Le système permet :

- d'enregistrer les conversations ;
- d'afficher les conversations précédentes ;
- de reprendre une ancienne discussion ;
- de supprimer une conversation.

L'objectif est de permettre à l'utilisateur de considérer chaque conversation comme une session indépendante pouvant être reprise ultérieurement.

---

# 🔊 Pipeline Vocal

Le système vocal de Maya est séparé en deux étapes principales :

```text
[ Utilisateur ]
      │
      ▼
[ Microphone ]
      │
      ▼
[ STT ]
      │
      ▼
[ Texte ]
      │
      ▼
[ Pipeline Maya ]
      │
      ▼
[ Réponse LLM ]
      │
      ▼
[ TTS ]
      │
      ▼
[ Audio ]
      │
      ▼
[ Avatar VRM ]
```

Cette séparation permet de remplacer indépendamment les différents composants du pipeline vocal.

---

## 🎙️ Reconnaissance Vocale (STT)

Le système de reconnaissance vocale est conçu pour transformer les entrées audio de l'utilisateur en texte exploitable par le pipeline Maya.

Le traitement STT reste indépendant de l'interface graphique afin de conserver une architecture modulaire.

Le moteur utilisé peut évoluer sans nécessiter de modification fondamentale de l'interface.

---

## 🔊 Synthèse Vocale (TTS)

La synthèse vocale est désormais **intégrée et fonctionnelle dans l'interface propriétaire**.

Le TTS transforme les réponses textuelles de Maya en audio afin de restituer une réponse vocale à l'utilisateur.

L'intégration actuelle privilégie :

- une génération rapide ;
- une latence réduite ;
- une voix adaptée à une conversation continue ;
- une consommation de ressources maîtrisée ;
- une intégration directe avec l'avatar.

Le moteur TTS peut évoluer indépendamment du reste de l'interface.

---

# 🔌 Connexion au Hub & aux outils

L'interface propriétaire communique avec le **Maya Hub**, qui centralise les différents outils disponibles pour Maya.

Cette architecture permet d'éviter de connecter directement chaque outil à l'interface.

```text
              ┌─────────────────────┐
              │      Maya UI        │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │      Maya Hub       │
              │       MCP           │
              └──────────┬──────────┘
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          [Outil 1]   [Outil 2]   [Outil 3]
```

---

## 🟢🔴 Indicateur de connexion

L'interface dispose désormais d'un indicateur visuel permettant de connaître immédiatement l'état de connexion aux outils.

### 🟢 Vert

La connexion avec le Hub et les outils est opérationnelle.

### 🔴 Rouge

La connexion avec le Hub ou les outils est indisponible.

Cette information permet à l'utilisateur de diagnostiquer rapidement un problème de connexion sans avoir à consulter les logs du système.

---

# 🧩 Architecture modulaire

L'un des objectifs principaux de l'interface propriétaire est de limiter les dépendances entre les différents composants.

```text
┌─────────────────────────────────────────────┐
│                MAYA UI                      │
├─────────────────────────────────────────────┤
│                                             │
│  VRM ────────┐                              │
│  TTS ────────┤                              │
│  Historique ─┤                              │
│  Background ─┤──► Interface propriétaire    │
│  Chat ───────┤                              │
│  Status ─────┘                              │
│                                             │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
                ┌──────────────┐
                │   Maya Hub   │
                └──────┬───────┘
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
          Plugins   Plugins   Plugins
```

Cette approche permet notamment de :

- remplacer un moteur vocal sans refaire l'interface ;
- ajouter un outil au Hub sans modifier le système VRM ;
- modifier l'apparence de Maya sans modifier le LLM ;
- faire évoluer l'historique indépendamment du Hub ;
- remplacer ou améliorer progressivement les composants.

---

# 🛠️ État actuel

| Fonctionnalité | État |
|---|---|
| Interface propriétaire | ✅ Fonctionnelle |
| Avatar VRM | ✅ Fonctionnel |
| Changement de VRM | ✅ Fonctionnel |
| Changement de fond | ✅ Fonctionnel |
| Chat | ✅ Fonctionnel |
| Historique | ✅ Stable |
| Reprise des conversations | ✅ Fonctionnelle |
| Suppression des conversations | ✅ Fonctionnelle |
| TTS | ✅ Fonctionnel |
| Connexion au Hub | ✅ Fonctionnelle |
| Indicateur de connexion | ✅ Fonctionnel |
| Communication avec les outils | ✅ Fonctionnelle |
| Outils du Hub | ✅ Fonctionnels |

---

# 🔮 Évolutions futures

L'interface actuelle constitue la base de la future Maya V1.

Les évolutions envisagées comprennent notamment :

- **Mode Overlay / Desktop Pet** ;
- amélioration des animations VRM ;
- animations et expressions plus avancées ;
- amélioration du lip-sync ;
- packaging de Maya sous forme d'application autonome ;
- lancement simplifié des différents services ;
- amélioration de la personnalisation de l'avatar ;
- évolution du système vocal ;
- éventuelle synchronisation entre plusieurs appareils.

Ces éléments seront développés progressivement afin de préserver la stabilité de l'interface actuelle.

---

# 🧠 Principe d'ingénierie

L'interface propriétaire n'a pas pour objectif de remplacer chaque composant existant par une solution maison.

Son objectif est de **maîtriser l'intégration entre les composants**.

Les moteurs spécialisés peuvent continuer à évoluer indépendamment :

- LLM ;
- STT ;
- TTS ;
- VRM ;
- Hub ;
- plugins ;
- mémoire.

Maya fournit la couche qui les réunit dans une expérience utilisateur cohérente.

> **L'objectif n'est pas de tout réinventer.**
>
> **L'objectif est de faire fonctionner les différentes briques comme un seul système.**
