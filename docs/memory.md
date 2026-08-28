# 🧠 Spécifications du Système de Mémoire — Maya

## 📐 Philosophie & Choix de Conception

Le système de mémoire de Maya repose sur un principe fondamental : la **simplicité**, la **légèreté** et la **souveraineté des données**.

### Pourquoi le format Plain-Text (.txt) ?
* **Portabilité & Mobilité (PC & Mobile) :** fichiers `.txt` bruts → synchronisation simple (Syncthing, etc.).
* **Transparence & Lisibilité :** éditables à tout moment par l’utilisateur.
* **Sobriété Applicative :** aucune base de données lourde.

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
