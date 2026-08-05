# 🔌 Spécifications du Hub Central & Architecture MCP — Maya

## 📐 Philosophie & Raison d'Être du Hub

Le **Hub Central** est le chef d'orchestre opérationnel de Maya.

Il est né d'un constat simple : au fur et à mesure que l'assistant s'enrichit en fonctionnalités (recherche Steam, contrôle des lumières WiZ, moteurs créatifs, veille web, autonomie), la gestion directe des outils par le LLM devient complexe et instable.

---

# 🎯 Objectifs principaux

## 1. Architecture Plug & Play

- Ajouter un outil MCP en quelques secondes.
- Tester un plugin indépendamment.
- Activer ou désactiver un module à chaud.
- Retirer un plugin sans modifier le pipeline principal.

---

## 2. Standardisation & Interface Web

Le Hub centralise toutes les interactions avec le monde extérieur grâce au **Model Context Protocol (MCP)**.

Il fournit également une interface Web moderne permettant de piloter l'ensemble du système.

### Caractéristiques

- Interface Glassmorphism + Cyberpunk Neon
- Gestion des plugins en temps réel
- Gestion des services système
- Dashboard Flask

---

## 3. Exécution Transparente

Le Hub :

- démarre automatiquement avec Maya (ou comme service dédié) ;
- fonctionne en tâche de fond ;
- expose un panneau de contrôle Flask accessible en permanence.

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
                  ┌────────────────────────┐         ┌────────────────────────┐
                  │    HUB CENTRAL MCP     │◄───────►│   Web Dashboard (Flask)│
                  │   Routeur & Gestion    │         │  UI Glassmorphism Neon │
                  └───────────┬────────────┘         └────────────────────────┘
                              │
      ┌───────────────────────┼────────────────────────┐
      ▼                       ▼                        ▼
┌──────────────┐       ┌──────────────┐         ┌──────────────┐
│  Domotique   │       │  DeepSearch  │         │ MCP Créatif  │
│ (Lumières)   │       │ (Web / R&D)  │         │  Critique    │
└──────────────┘       └──────────────┘         └──────────────┘
                              │
                              ▼
                     ┌────────────────┐
                     │ Plugin MEMORY  │
                     │ Compétences    │
                     └────────────────┘
```

---

# 🎛️ Dashboard Web

Le Hub intègre un serveur Flask permettant de visualiser et contrôler l'ensemble du système.

## Fonctionnalités

### 📊 Visualisation dynamique

- Détection automatique des plugins.
- Affichage de leurs capacités MCP.

### 🔄 Activation / Désactivation à chaud

Switchs permettant d'activer ou désactiver :

- les plugins MCP ;
- les services système (Auto-Learning, etc.).

Aucun redémarrage n'est nécessaire.

### 🎨 Interface

- Glassmorphism
- Cyberpunk Neon
- Cartes interactives
- Animations et effets de survol

### 🌐 API REST

Endpoints disponibles :

- `/api/toggle_plugin`
- `/api/toggle_service`

---

# 🛠️ Modules Opérationnels

---

## 💡 Module Domotique — WiZ

**Statut :** ✅ Validé

### Fonctionnement

- Scan automatique du réseau local.
- Détection des ampoules WiZ.
- Récupération automatique des IP.

### Fonctionnalités

- Allumer les lumières
- Éteindre les lumières
- Modifier les couleurs
- Changer l'ambiance
- Contrôle vocal ou textuel

---

## 🎨 Module MCP Créatif

**Statut :** ✅ Validé

Afin d'éviter les productions génériques, Maya utilise une boucle de réflexion en trois étapes.

### 1. Génération

Création de plusieurs propositions selon :

- le thème ;
- le style demandé ;
- les contraintes éventuelles.

### 2. Critique

Le LLM joue le rôle d'un critique exigeant.

Il :

- analyse chaque proposition ;
- identifie les points faibles ;
- attribue une note.

### 3. Sélection & Refactor

Dernière passe :

- sélection de la meilleure proposition ;
- amélioration si nécessaire ;
- retour uniquement de la version finale.

---

## 🔍 Module DeepSearch

**Statut :** ✅ Validé (V1)

### Principe

Le module effectue des recherches Web via les outils MCP du Hub.

### Traitement

Il peut automatiquement :

- lancer plusieurs recherches ;
- effectuer des recherches secondaires ;
- croiser les sources ;
- produire une synthèse finale.

### Utilisation

Le module peut être appelé :

- par l'utilisateur ;
- automatiquement par l'Auto-Learning.

---

## 🧠 Plugin MEMORY

**Statut :** ✅ Validé

> ⚠️ Ce plugin est totalement indépendant de la mémoire de personnalité de Maya.

Il stocke uniquement :

- les compétences ;
- les procédures ;
- les connaissances techniques ;
- les informations validées issues des recherches.

---

# ⚙️ Auto-Learning

**Statut :** ✅ Validé (V2 — Planification Fixe)

Le système réalise automatiquement des missions de veille afin d'enrichir les connaissances de Maya.

Il peut être activé ou désactivé à tout moment depuis le Dashboard.

---

# 🔄 Flux d'exécution

```text
      [ Cycle toutes les 20 minutes ]
                     │
                     ▼
        [ Scheduler Autonome du Hub ]
                     │
                     ▼
[ Service activé + Limite 1x/jour/sujet ]
                     │
                     ▼
          [ priority.py (Round Robin) ]
                     │
                     ▼
          [ Executor + DeepSearch ]
                     │
                     ▼
          [ Filtre Sémantique IA ]
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   Doublon détecté         Nouvelle information
         │                       │
         ▼                       ▼
   NO_NEW_INFO             Validation IA
         │                       │
         ▼                       ▼
 Pas de sauvegarde      Archivage Plugin MEMORY
```

---

# 🧠 Logique de Planification

## ⏱️ Fréquence

Le Scheduler se réveille automatiquement toutes les **20 minutes**.

Cette nouvelle version ne possède plus :

- d'Idle Tracker ;
- de détection d'inactivité utilisateur ;
- de gestion de statut *busy*.

L'exécution est désormais entièrement basée sur une cadence fixe.

---

## 📅 Limite : 1 exécution par jour et par sujet

Chaque sujet présent dans `goals.json` ne peut être traité qu'une seule fois par jour.

Si un sujet a déjà été exécuté aujourd'hui :

➡️ le Scheduler passe automatiquement au sujet suivant.

---

## 🔄 Rotation Round Robin

Le Scheduler parcourt les objectifs dans l'ordre de priorité.

Il sélectionne le premier sujet :

- actif ;
- non exécuté aujourd'hui.

Lorsque tous les sujets ont été traités :

- aucune nouvelle recherche n'est lancée ;
- le Scheduler attend simplement le jour suivant.

---

# 🧹 Filtre Sémantique

Avant chaque sauvegarde, une seconde analyse IA compare la nouvelle synthèse avec les connaissances déjà présentes.

## Cas 1

Information déjà connue

```text
NO_NEW_INFO
```

➡️ aucune sauvegarde.

---

## Cas 2

Nouvelle information pertinente

La synthèse est validée puis automatiquement archivée dans le **Plugin MEMORY**.
