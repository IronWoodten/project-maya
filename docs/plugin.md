# 🎭 Spécifications de l'Interface & Incarnation — Maya

## 📐 Philosophie & Évolution de l'Interface

L'incarnation de Maya repose sur deux exigences majeures :

- **La fluidité d'interaction en temps réel**
- **Une présence visuelle personnalisable et non-intrusive**

Le projet a initialement utilisé **OpenLLMVTuber** comme base d'expérimentation. Cette architecture a permis de valider rapidement le concept d'un assistant incarné avec avatar, voix et interaction avec des outils externes.

Cependant, les limitations rencontrées avec OpenLLMVTuber et le système Live2D ont progressivement conduit au développement d'une **interface propriétaire dédiée à Maya**.

Cette interface constitue désormais le client principal du projet.

---

## 🔄 Architecture actuelle

L'interface propriétaire sépare clairement la présentation de Maya de ses différents services :

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
              │  (local)   │               │    MCP      │
              └────────────┘               └──────┬──────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              │                   │                   │
                              ▼                   ▼                   ▼
                           [Outils]            [MEMORY]            [Skills]
```

---

# 🖥️ Interface Propriétaire

L'interface prend notamment en charge :

- Affichage de l'avatar VRM (clignement d'yeux, expressions, animations, blush)
- Changement de modèle VRM et d'arrière-plan
- Chat + historique des conversations (reprise / suppression)
- Mini-chat en overlay (réductible / masquable)
- Espace de discussion modulable (agrandir / réduire)
- Indicateurs visuels en temps réel (Hub, LLM, TTS, STT)
- Mode Desktop Pet / Overlay (fenêtre transparente, clics traversants)
- Synthèse vocale hybride (Piper TTS local + Edge-TTS)
- Speech-to-Text
- Options UI dynamiques
- Système de compétences (skills)
- Ingestion de documents
- Système de rappels (Reminder)
- Jeux intégrés

---

## 🧍 Avatar VRM

Le système d'incarnation utilise le format **VRM**.

- Représentation 3D complète
- Changement dynamique de modèle
- Clignement d'yeux naturel
- Expressions faciales dynamiques (joie, tristesse, colère, blush…)
- Animations manuelles (clic droit)
- Postures d'idle (assise / debout)

---

## 🎨 Arrière-plan

L'interface permet de modifier l'arrière-plan indépendamment de l'avatar et de l'UI.

---

## 💬 Gestion des conversations

- Enregistrement des sessions
- Historique avec prévisualisation
- Reprise d'anciennes discussions
- Suppression de conversations
- Mini-chat overlay réductible / masquable
- Espace chat modulable

---

## 🔊 Pipeline Vocal

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
[ Audio + Avatar VRM ]
```

- **STT** : Fast-Whisper
- **TTS** : Piper (local) + Edge-TTS (cloud)
- Pipeline modulaire et débrayable

---

## 🟢🔴 Indicateurs de connexion

L'interface affiche des indicateurs visuels (diodes) pour :

- Hub central
- LLM
- TTS
- STT

- 🟢 Vert = opérationnel
- 🔴 Rouge = indisponible

---

# 📚 Système de compétences (Skills)

Depuis la v1.4, Maya dispose d'un système de compétences léger, lisible et injecté intelligemment.

C'est une forme de **RAG simplifié** : plus lisible et plus contrôlable qu'une base vectorielle classique.

### Fichier

`skills.json` (rechargé automatiquement à chaque enregistrement)

### Structure

```json
{
  "_aide": "Chaque compétence : name (libre), triggers (mots-clés), content (texte injecté, 2 à 4 phrases), enabled (true/false). Optionnel : strong = mots-clés qui suffisent seuls à la déclencher ; min_score = score à atteindre (1 par défaut). Un mot présent dans plusieurs compétences (sujet récurrent) ou listé dans strong vaut 1 : il suffit seul. Un mot propre à une seule compétence vaut 0,5 : il en faut deux. Les mots retrouvés seulement dans les 2 messages précédents valent moitié moins, et au moins un mot doit toujours être dans le message actuel. Accents, majuscules, pluriels et conjugaisons sont tolérés. Le fichier est rechargé automatiquement quand tu l'enregistres. Les compétences créées automatiquement (id auto-...) peuvent être corrigées ou désactivées ici.",
  "version": 1,
  "memory_imported": false,
  "skills": [
    {
      "id": "exemple",
      "name": "Exemple (désactivé)",
      "enabled": false,
      "triggers": ["motcleexemple", "autremotexemple"],
      "strong": ["motcleexemple"],
      "content": "Texte court (2-4 phrases) que Maya recevra uniquement quand le message contient le mot-clé."
    }
  ]
}
```

### Règles d'injection

| Type de mot | Score |
|-------------|-------|
| Mot **strong** (ou présent dans plusieurs compétences) | 1 |
| Mot faible (propre à une seule compétence) | 0.5 |
| Mot trouvé seulement dans les 2 messages précédents | × 0.5 |

- Score minimum par défaut : **1**
- Au moins un mot-clé doit être présent dans le **message actuel**
- Accents, majuscules, pluriels et conjugaisons sont tolérés

Quand le score est atteint, le `content` de la compétence est injecté discrètement dans le contexte (sans polluer l'historique de discussion).

### Compétences automatiques

Les compétences créées automatiquement portent un `id` du type `auto-...`.  
Elles peuvent être corrigées, renommées ou désactivées directement dans `skills.json`.

---

# 📄 Ingestion de documents

L'utilisateur peut transformer un document en compétence permanente.

### Fonctionnement

1. Clic sur l'**icône trombone**
2. Sélection d'un fichier **PDF** ou **DOCX**
3. Maya extrait le contenu pertinent et crée automatiquement une compétence dans `skills.json`
4. Pendant le process, Maya peut répondre directement sur le contenu du document
5. Le document brut **n'est pas conservé** (ni dans l'historique, ni dans le journal)
6. Seule la compétence créée reste

Résultat : 0 % d'encombrement, connaissance durable et injectable par mots-clés.

---

# 🔔 Système de rappels (Reminder)

Distinct du **Plugin Timer** (minuteur court avec fenêtre desktop).

Le système de rappels permet de programmer des alertes **entre les sessions**.

### Exemples d'usage

- « Rappelle-moi dans 1 semaine de… »
- « Rappelle-moi le 15 mars 2027 à 14h de… »

### Fonctionnement

1. L'utilisateur formule le rappel en langage naturel
2. Maya enregistre le rappel
3. À l'échéance, une alerte est envoyée à Maya
4. Maya rappelle le sujet de façon naturelle dans la conversation

---

# 🔄 Lien avec le Hub & l'Auto-Learning

```text
Auto-Learning
      │
      ▼
Plugin MEMORY (Hub)
      │  • Base de connaissances appelable à la demande
      │  • Transfert des recherches internet
      ▼
skills.json
      │
      ▼
Injection intelligente par matching de mots-clés
```

- Le **Plugin MEMORY** du Hub reste la base de connaissances technique et le point de passage des recherches.
- Les **skills** sont la forme légère, lisible et automatiquement injectable dans le contexte de conversation.

---

# 🔌 Connexion au Hub

L'interface communique uniquement avec le **Maya Hub** (MCP), qui centralise les outils.

L'interface n'a pas besoin de connaître l'implémentation interne de chaque plugin.

---

# 🛠️ État actuel

| Fonctionnalité                        | État          |
|---------------------------------------|---------------|
| Interface propriétaire                | ✅ Fonctionnelle |
| Avatar VRM + Blink + Expressions      | ✅ Fonctionnel |
| Mode Desktop Pet / Overlay            | ✅ Fonctionnel |
| Mini-chat overlay réductible          | ✅ Fonctionnel |
| Espace chat modulable                 | ✅ Fonctionnel |
| Indicateurs diodes (Hub/LLM/TTS/STT)  | ✅ Fonctionnel |
| Historique & sessions                 | ✅ Stable |
| TTS hybride (Piper + Edge)            | ✅ Fonctionnel |
| STT                                   | ✅ Fonctionnel |
| Système de compétences (skills)       | ✅ Fonctionnel |
| Ingestion de documents                | ✅ Fonctionnel |
| Rappels (Reminder)                    | ✅ Fonctionnel |
| Jeux intégrés                         | ✅ Fonctionnel |
| Connexion Hub + outils                | ✅ Fonctionnel |

---

# 🔮 Pistes d'évolution

- Amélioration continue du matching des skills
- Enrichissement des animations VRM et du lip-sync
- Nouveaux plugins Hub
- Affinage du système de rappels

---

# 🧠 Principe d'ingénierie

L'interface propriétaire n'a pas pour objectif de remplacer chaque composant existant par une solution maison.

Son objectif est de **maîtriser l'intégration entre les composants**.

Les moteurs spécialisés peuvent continuer à évoluer indépendamment :

- LLM
- STT / TTS
- VRM
- Hub
- Plugins
- Mémoire
- Skills

Maya fournit la couche qui les réunit dans une expérience utilisateur cohérente.

> **L'objectif n'est pas de tout réinventer.**  
> **L'objectif est de faire fonctionner les différentes briques comme un seul système.**
```
