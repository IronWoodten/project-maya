# 🧠 Spécifications du Système de Mémoire — Maya

## 📐 Philosophie & Choix de Conception

Le système de mémoire de Maya repose sur un principe fondamental : la **simplicité**, la **légèreté** et la **souveraineté des données**.

### Pourquoi le format Plain-Text (.txt) ?

- **Portabilité & Mobilité (PC & Mobile) :** fichiers `.txt` bruts → synchronisation simple (Syncthing, etc.).
- **Transparence & Lisibilité :** éditables à tout moment par l’utilisateur.
- **Sobriété Applicative :** aucune base de données lourde.

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
│ 3. JOURNAL ANCIEN (journal_ancien.txt)                  │
│    • Archives (> 30 jours)                              │
│    • Consulté à la demande                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 4. HISTORIQUE CORE (core_history.txt)                   │
│    • Registre permanent des faits canoniques            │
│    • Sert uniquement à l’anti-doublon sémantique        │
│    • Jamais nettoyé ni réinjecté dans le prompt         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 5. MÉMOIRE DES COMPÉTENCES & DEEPSEARCH (Hub MCP)       │
│    • Module séparé (workflows, savoir-faire, recherche) │
└─────────────────────────────────────────────────────────┘

> ⚠️ La mémoire d’identité/histoire (Core + journaux) est strictement séparée du plugin Memory du Hub Central.

---

## 🔄 1. Sauvegarde de Session

Il n’y a plus de commande `/save`.

La sauvegarde se fait via une **icône dédiée** dans l’interface :

1. L’utilisateur clique sur l’icône en fin de session (ou quand il le souhaite).
2. Le système scanne le fichier `.json` du chat courant.
3. Le LLM produit un résumé propre des faits marquants, décisions et événements.
4. Ce résumé est ajouté à `journal_recent.txt`.

### Pourquoi ce choix ?

- Plus fiable que de laisser le LLM décider seul de ce qu’il doit retenir.
- Plus adapté à un usage desktop (pas de tâche planifiée fragile).
- L’utilisateur garde le contrôle du moment de la consolidation.

---

## ⚙️ 2. Cycle de Maintenance (V3 — tous les 7 jours)

Le cycle n’est plus déclenché bêtement à chaque démarrage. Il tourne de façon autonome tous les **7 jours** (suivi via `memory_state.json`).

### Étapes du cycle

1. **Transfert mécanique**  
   Les entrées de `journal_recent.txt` vieilles de plus de 30 jours sont déplacées vers `journal_ancien.txt`.

2. **Scan d’occurrence (fenêtre glissante 35 jours)**  
   Analyse des 35 derniers jours de `journal_ancien.txt`.  
   Le chevauchement évite de rater les faits à cheval sur deux cycles.

3. **Canonisation**  
   Chaque fait récurrent est reformulé en une phrase déclarative courte et normalisée  
   (sujet → fait → date éventuelle).

4. **Anti-doublon sémantique**  
   La forme canonique est comparée sémantiquement à `core_history.txt`.  
   Si le fait est déjà présent → rien n’est écrit.

5. **Écriture sécurisée**  
   Si le fait est nouveau :
   - ajout dans `Maya_core.txt` (mémoire active)
   - ajout dans `core_history.txt` (registre permanent)
   - via un wrapper qui garantit des sauts de ligne propres.

---

## 🚀 3. Orchestration au démarrage

Script maître : `startup_memory.py`

### Séquencement

1. Archivage mécanique synchrone (> 30 jours)
2. Lancement asynchrone (non bloquant) du cycle de réflexion si nécessaire
3. Démarrage du serveur MCP

---

## 📂 Structure des Fichiers

```text
maya/
└── memory/
    ├── Maya_core.txt        # Mémoire active / identité (injecté)
    ├── core_history.txt     # Registre anti-doublon (jamais injecté)
    ├── journal_recent.txt   # ~30 derniers jours (injecté)
    ├── journal_ancien.txt   # Archives (consulté à la demande)
    └── memory_state.json    # Suivi du cycle de réflexion
