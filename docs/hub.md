# 🔌 Spécifications du Hub Central & Architecture MCP — Maya

## 📐 Philosophie & Raison d'Être du Hub

Le **Hub Central** est le chef d'orchestre opérationnel de Maya. Il est né d'un constat simple : au fur et à mesure que l'assistant s'enrichit en fonctionnalités (recherche Steam, contrôle des lumières WiZ, moteurs créatifs, veille web, autonomie), la gestion directe des outils par le LLM devient complexe et instable.

### 🎯 Objectifs principaux

1. **Architecture Plug & Play**
   - Ajouter, tester, désactiver ou retirer un outil MCP en quelques secondes.
   - Aucun besoin de modifier le pipeline principal.

2. **Standardisation**
   - Uniformiser toutes les interactions avec le monde extérieur grâce au **Model Context Protocol (MCP)**.

3. **Exécution transparente**
   - Le Hub démarre automatiquement avec Maya.
   - Fonctionne en tâche de fond sans intervention de l'utilisateur.

---

# 🏗️ Architecture du Hub

```text
                  ┌────────────────────────┐
                  │      Moteur LLM        │
                  └───────────┬────────────┘
                              │
               (Intent / Appel d'outil via MCP)
                              │
                              ▼
                  ┌────────────────────────┐
                  │    HUB CENTRAL MCP     │
                  │   Routeur & Gestion    │
                  └───────────┬────────────┘
                              │
      ┌───────────────────────┼────────────────────────┐
      ▼                       ▼                        ▼
┌──────────────┐      ┌──────────────┐        ┌──────────────┐
│  Domotique   │      │  DeepSearch  │        │ MCP Créatif  │
│ (Lumières)   │      │ (Web / R&D)  │        │  Critique    │
└──────────────┘      └──────────────┘        └──────────────┘
                              │
                              ▼
                     ┌────────────────┐
                     │ Plugin MEMORY  │
                     │ Compétences    │
                     └────────────────┘
```

---

# 🛠️ Modules Opérationnels

## 💡 Module Domotique — Contrôle WiZ Local

**Statut :** ✅ Validé

### Fonctionnement

- Scan automatique du réseau local.
- Détection dynamique des ampoules WiZ allumées.
- Récupération automatique des adresses IP.

### Fonctionnalités

- Allumer les lumières.
- Éteindre les lumières.
- Modifier les couleurs.
- Changer l'ambiance lumineuse.
- Contrôle par commande vocale ou textuelle.

---

## 🎨 Module MCP Créatif — Boucle Critique à 3 Prompts

**Statut :** ✅ Validé

Afin d'éviter les productions génériques, Maya utilise un pipeline de réflexion en trois étapes.

### Étape 1 — Génération

Création de plusieurs propositions à partir :

- du thème demandé ;
- du style souhaité ;
- des contraintes éventuelles.

### Étape 2 — Critique

Le LLM adopte le rôle d'un critique exigeant.

Il :

- analyse chaque proposition ;
- relève les points faibles ;
- attribue une note.

### Étape 3 — Sélection & Refactor

Une dernière passe :

- sélectionne la meilleure proposition ;
- améliore le contenu si nécessaire ;
- renvoie uniquement la version finale.

---

## 🔍 Module DeepSearch — Recherche Web Avancée

**Statut :** ✅ Validé (V1)

### Principe

Le module effectue des recherches web via les outils MCP du Hub.

### Traitement interne

En arrière-plan, il peut :

- lancer plusieurs recherches ;
- effectuer des recherches secondaires ;
- croiser les informations ;
- produire une synthèse finale.

### Utilisation

Le module peut être appelé :

- directement par l'utilisateur ;
- automatiquement par le Scheduler d'Auto-Learning.

---

## 🧠 Plugin MEMORY

**Statut :** ✅ Validé

> ⚠️ Ce plugin est totalement indépendant de la mémoire de personnalité de Maya.

Il stocke uniquement :

- les compétences ;
- les procédures ;
- les connaissances techniques ;
- les informations validées provenant des recherches.

### Mode Manuel

L'utilisateur peut demander explicitement :

- d'enregistrer une procédure ;
- de mémoriser une information importante ;
- de conserver un savoir-faire.

### Mode Autonome

Le plugin est alimenté automatiquement par les synthèses validées du module DeepSearch.

---

# ⚙️ Système d'Apprentissage Autonome (Idle Auto-Learning)

**Statut :** ✅ Validé (V1)

Le système exploite les périodes d'inactivité afin d'améliorer continuellement les connaissances de Maya sans perturber l'utilisateur.

## Flux d'exécution

```text
      [ Inactivité utilisateur (20 min) ]
                     │
                     ▼
      [ Scheduler Autonome du Hub ]
                     │
                     ▼
[ Vérification : Idle + Limite quotidienne ]
                     │
                     ▼
      [ priority.py - Round Robin ]
                     │
                     ▼
     [ Executor + DeepSearch ]
                     │
                     ▼
     [ Filtre Sémantique IA ]
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   Doublon / Redondant      Nouvelle information
         │                       │
         ▼                       ▼
     NO_NEW_INFO          Validation IA
         │                       │
         ▼                       ▼
 Pas de sauvegarde       Archivage Plugin MEMORY
```

---

# 🧠 Logique d'Exécution

## ⏱️ Détection d'Inactivité (Idle Guard)

Le composant **idle_manager** surveille en permanence l'activité utilisateur.

Après **20 minutes d'inactivité continue**, le Scheduler est autorisé à lancer une mission autonome.

---

## 🚧 Gestion de l'État Busy

Pendant toute recherche ou appel d'outil :

```text
busy = True
```

À la fin de la tâche :

- `busy` repasse à `False` ;
- le timer d'inactivité est réinitialisé ;
- aucun déclenchement en cascade n'est possible.

---

## 🔄 Rotation Temporelle des Objectifs (Round Robin)

Les objectifs définis dans `goals.json` ne sont jamais considérés comme "terminés".

Le Scheduler sélectionne toujours :

1. l'objectif dont `last_checked` est le plus ancien ;
2. en respectant les priorités en cas d'égalité.

Exemple de rotation :

```text
Actualités IA
      ↓
Cuisine
      ↓
Blender
      ↓
Communication
      ↓
Actualités IA
      ↓
...
```

Cette approche garantit une veille continue et équilibrée.

---

## 🧹 Filtre Sémantique Anti-Pollution

Avant toute sauvegarde, une seconde analyse IA compare la nouvelle synthèse avec les connaissances déjà présentes.

### Cas n°1 — Information déjà connue

Le modèle répond :

```text
NO_NEW_INFO
```

Conséquences :

- aucune sauvegarde ;
- aucune pollution de la mémoire.

### Cas n°2 — Nouvelle information pertinente

Si la recherche apporte :

- des faits précis ;
- des nouveautés concrètes ;
- des connaissances réellement utiles ;

alors :

- la synthèse est validée ;
- elle est archivée automatiquement dans le **Plugin MEMORY**.
