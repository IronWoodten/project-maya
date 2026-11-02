# 🧠 Spécifications du Système de Mémoire — Maya

## ⚠️ Point crucial — Sauvegarde manuelle

**Maya ne sauvegarde pas automatiquement sa mémoire de session.**

Pour que le système de mémoire fonctionne correctement, l’utilisateur **doit cliquer sur l’icône disquette** :

- autant de fois qu’il le souhaite pendant la journée
- ou dès qu’un moment important vient de se passer
- **et au minimum 1 fois par jour d’utilisation**

C’est cette action qui :
1. résume la session en cours
2. ajoute les moments forts dans le journal
3. alimente ensuite le cycle de réflexion, le Core et le journal mensuel

Sans cette sauvegarde régulière, Maya oublie progressivement ce qui s’est passé.

→ Voir aussi le [README](../README.md) et la [FAQ Utilisateur](../Maya_FAQ_Utilisateur.pdf)

---

## 📐 Philosophie & Choix de Conception

Le système de mémoire de Maya repose sur un principe fondamental : la **simplicité**, la **légèreté** et la **souveraineté des données**.

### Pourquoi le format Plain-Text (.txt) ?

- **Portabilité & Mobilité (PC & Mobile)** : fichiers `.txt` bruts → synchronisation simple (Syncthing, etc.)
- **Transparence & Lisibilité** : éditables à tout moment par l’utilisateur
- **Sobriété Applicative** : aucune base de données lourde

---

## 🏛️ Les Piliers de la Mémoire

```text
┌─────────────────────────────────────────────────────────┐
│ 1. CORE (Maya_core.txt / core.txt)                      │
│    • Identité, traits, faits canoniques                 │
│    • Injecté en permanence dans le prompt système       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 2. JOURNAL RÉCENT (journal_recent.txt)                  │
│    • Sessions des ~30 derniers jours                    │
│    • Injecté dans le prompt système                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 3. JOURNAL MENSUEL (journal_mensuel.txt)                │
│    • Résumés des mois clos                              │
│    • Généré dès qu’un nouveau mois a 1 entrée           │
│      dans journal_ancien                                │
│    • Réinjecté en permanence (en plus du journal récent)│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 4. JOURNAL ANCIEN (journal_ancien.txt)                  │
│    • Archives (> 30 jours)                              │
│    • Consulté à la demande                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 5. HISTORIQUE CORE (core_history.txt)                   │
│    • Registre permanent des faits canoniques            │
│    • Sert uniquement à l’anti-doublon sémantique        │
│    • Jamais nettoyé ni réinjecté dans le prompt         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 6. MÉMOIRE DES COMPÉTENCES & DEEPSEARCH (Hub MCP)       │
│    • Module séparé (workflows, savoir-faire, recherche) │
│    • Voir docs/plugin.md et docs/hub.md                 │
└─────────────────────────────────────────────────────────┘
```

> ⚠️ La mémoire d’identité/histoire (`Core` + journaux) est strictement séparée du plugin `MEMORY` du Hub Central et du système de compétences (`skills.json`).

---

## 🔄 1. Sauvegarde de Session

Il n’y a plus de commande `/save`.

La sauvegarde se fait via une **icône dédiée** (disquette) dans l’interface :

1. L’utilisateur clique sur l’icône en fin de session (ou quand il le souhaite).
2. Le système scanne le fichier `.json` du chat courant.
3. Le LLM produit un résumé propre des faits marquants, décisions et événements.
4. Ce résumé est ajouté à `journal_recent.txt`.

**Recommandation d’usage :**
- Cliquer **au moins une fois par jour d’utilisation**
- Cliquer plus souvent si des moments importants se produisent
- Ne pas hésiter à sauvegarder plusieurs fois dans la même journée

**Pourquoi ce choix ?**
- Plus fiable que de laisser le LLM décider seul de ce qu’il doit retenir
- Plus adapté à un usage desktop (pas de tâche planifiée fragile)
- L’utilisateur garde le contrôle du moment de la consolidation

---

## 📅 2. Journal mensuel (v1.2+)

Le **journal mensuel** (`journal_mensuel.txt`) complète le journal récent.

### Fonctionnement

- `journal_recent.txt` = les **~30 derniers jours** (détail fin)
- `journal_mensuel.txt` = les **résumés des mois déjà clos**

### Déclenchement

Dès qu’un nouveau mois commence à avoir **au moins une entrée** dans `journal_ancien.txt`, le mois précédent est considéré comme clos.

Maya génère alors un résumé de ce mois et l’ajoute dans `journal_mensuel.txt`.

### Injection

Le contenu de `journal_mensuel.txt` est **réinjecté en permanence** dans le prompt, **en plus** du journal récent.

Les deux coexistent :
- le journal récent apporte le détail proche
- le journal mensuel apporte la continuité sur plusieurs mois sans saturer le contexte

---

## ⚙️ 3. Cycle de Maintenance (V3 — tous les 7 jours)

Le cycle n’est plus déclenché bêtement à chaque démarrage. Il tourne de façon autonome tous les **7 jours** (suivi via `memory_state.json`).

### Étapes du cycle

1. **Transfert mécanique**  
   Les entrées de `journal_recent.txt` vieilles de plus de 30 jours sont déplacées vers `journal_ancien.txt`.

2. **Scan d’occurrence (fenêtre glissante 35 jours)**  
   Analyse des 35 derniers jours de `journal_ancien.txt`.  
   Le chevauchement évite de rater les faits à cheval sur deux cycles.

3. **Canonisation**  
   Chaque fait récurrent est reformulé en une phrase déclarative courte et normalisée (sujet → fait → date éventuelle).

4. **Anti-doublon sémantique**  
   La forme canonique est comparée sémantiquement à `core_history.txt`.  
   Si le fait est déjà présent → rien n’est écrit.

5. **Écriture sécurisée**  
   Si le fait est nouveau :
   - ajout dans `Maya_core.txt` (mémoire active)
   - ajout dans `core_history.txt` (registre permanent)

   via un wrapper qui garantit des sauts de ligne propres.

---

## ✨ 4. Améliorations v1.4 (mémoire pure)

Depuis la version 1.4, le système de mémoire a été renforcé sur plusieurs points :

- **Moments forts** : s’ajoutent proprement au fil de la journée (plus de collage brut)
- **Émotions** : réécrites dynamiquement au lieu de s’accumuler
- **Journal** : nettement plus lisible
- **Contexte** : consommation optimisée (moins de tokens inutiles)

Ces changements rendent la mémoire plus propre sur la durée et plus efficace à l’usage quotidien.

---

## 🚀 5. Orchestration au démarrage

Script maître : `startup_memory.py`

Séquencement :

1. Archivage mécanique synchrone (> 30 jours)
2. Lancement asynchrone (non bloquant) du cycle de réflexion si nécessaire
3. Démarrage du serveur MCP

---

## 📂 Structure des Fichiers

```text
maya/
└── memory/
    ├── Maya_core.txt          # Mémoire active / identité (injecté)
    ├── core_history.txt       # Registre anti-doublon (jamais injecté)
    ├── journal_recent.txt     # ~30 derniers jours (injecté)
    ├── journal_mensuel.txt    # Résumés des mois clos (injecté)
    ├── journal_ancien.txt     # Archives (consulté à la demande)
    └── memory_state.json      # Suivi du cycle de réflexion
```

---

## 📌 Résumé du flux

```text
Session de chat
      │
      ▼
[ Clic icône disquette ]  ← obligatoire (au moins 1× / jour)
      │
      ▼
Résumé → journal_recent.txt
      │
      ├── (> 30 jours) → journal_ancien.txt
      │
      ├── (mois clos)  → journal_mensuel.txt
      │
      └── (cycle 7j)   → Core + core_history
```

Sans le clic sur l’icône disquette, ce flux ne démarre pas.
```
