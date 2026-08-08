# 🔌 Spécifications du Hub Central & Architecture MCP — Maya

## 📐 Philosophie & Raison d'Être du Hub

Le **Hub Central** est le chef d'orchestre opérationnel de Maya.

Il est né d'un constat simple : au fur et à mesure que l'assistant s'enrichit en fonctionnalités, la gestion directe des outils par le LLM devient complexe et difficile à maintenir.

Le Hub fournit une couche intermédiaire permettant de centraliser les outils, leurs capacités et leur exécution tout en conservant une architecture modulaire.

---

# 🎯 Objectifs principaux

## 1. Architecture Plug & Play

Le Hub est conçu pour permettre :

- d'ajouter un outil MCP indépendamment du reste du système ;
- de tester un plugin indépendamment ;
- d'activer ou désactiver un module ;
- de retirer un plugin sans modifier le pipeline principal ;
- de faire évoluer les outils sans modifier l'interface Maya.

---

## 2. Standardisation & Interface Web

Le Hub centralise les interactions avec les outils externes grâce au **Model Context Protocol (MCP)**.

Il fournit également une interface Web permettant de superviser le système.

### Caractéristiques

- Interface Glassmorphism + Cyberpunk Neon
- Gestion des plugins
- Gestion des services système
- Dashboard Flask
- Visualisation de l'état des composants

---

## 3. Exécution Transparente

Le Hub :

- fonctionne comme un service indépendant ;
- peut être lancé avec Maya ;
- fonctionne en tâche de fond ;
- expose un panneau de contrôle Flask ;
- permet à l'interface Maya de connaître l'état des outils disponibles.

---

# 🏗️ Architecture du Hub

```text
                  ┌────────────────────────┐
                  │      Moteur LLM        │
                  └───────────┬────────────┘
                              │
                     Tool Calls / MCP
                              │
                              ▼
                  ┌────────────────────────┐
                  │      HUB CENTRAL       │◄──────────────┐
                  │         MCP            │               │
                  │  Routage & Gestion     │               │
                  └───────────┬────────────┘               │
                              │                            │
               ┌──────────────┼──────────────┐             │
               ▼              ▼              ▼             │
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
        │ DeepSearch  │ │   MEMORY    │ │Auto-Learning│   │
        │             │ │             │ │             │   │
        └─────────────┘ └─────────────┘ └─────────────┘   │
                                                         │
                              ┌──────────────────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │    Web Dashboard       │
                  │   Flask / Neon UI      │
                  └────────────────────────┘
