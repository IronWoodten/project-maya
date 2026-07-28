# 🧠 Spécifications du Système de Mémoire — Maya

## 📐 Philosophie & Choix de Conception

Le système de mémoire de Maya repose sur un principe fondamental : la **simplicité**, la **légèreté** et la **souveraineté des données**.

### Pourquoi le format Plain-Text (.txt) ?
* **Portabilité & Mobilité (PC & Mobile) :** Le choix de fichiers `.txt` bruts garantit une synchronisation ultra-rapide et sans conflit entre différentes plateformes (future version mobile sur smartphone/tablette via Syncthing, LocalCloud, etc.).
* **Transparence & Lisibilité :** Les fichiers restent lisibles et éditables par l'utilisateur à tout moment sans dépendre d'une base de données complexe ou propriétaire.
* **Sobriété Applicative :** Pas d'empreinte mémoire inutile liée à des SGBD lourds pour la gestion du texte.

---

## 🏛️ Les 4 Piliers de la Mémoire

Le système de mémoire distingue clairement la personnalité, les événements passés et le savoir-faire applicatif :

```text
┌─────────────────────────────────────────────────────────┐
│ 1. CORE (core.txt)                                      │
│    • Identité, traits de caractère, valeurs profondes   │
│    • Injecté en permanence dans le prompt système       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 2. JOURNAL RÉCENT (journal_recent.txt)                  │
│    • Souvenirs et sessions des 30 derniers jours        │
│    • Injecté directement dans le prompt système         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 3. JOURNAL ANCIEN (journal_ancien.txt)                  │
│    • Archives consolidées (> 30 jours)                  │
│    • Consulté par le LLM à la demande (Lookup manuel)  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 4. MÉMOIRE DES COMPÉTENCES & DEEPSEARCH (Hub MCP)      │
│    • Module séparé géré au niveau du Hub MCP            │
│    • Stocke les workflows, le savoir-faire et la recherche│
└─────────────────────────────────────────────────────────┘
```

> ⚠️ **Note importante d'architecture :** La mémoire de l'identité/histoire de Maya (`Core`, `Journal Récent`, `Journal Ancien`) est strictement séparée du plugin `Memory` présent dans le Hub Central. Le plugin du Hub sert exclusivement à la gestion des compétences applicatives et au module de recherche DeepSearch.

---

## 🔄 1. La Sauvegarde de Session (Pourquoi le choix du `/save` explicite ?)

Dans la plupart des projets d'assistants locaux, deux approches sont traditionnellement retenues, mais elles présentent toutes deux des failles majeures en pratique :

* **Pourquoi PAS de sauvegarde automatique par l'IA ?**  
  Les tests (notamment sur des solutions comme AnythingLLM) montrent que laisser le LLM décider seul de ce qu'il doit sauvegarder est bancale. Le modèle a tendance à polluer le journal en répétant des informations inutiles ou triviales, tout en oubliant des détails essentiels ou des éléments de contexte très importants.
* **Pourquoi PAS de sauvegarde à heure fixe (ex: Cron / Tâche planifiée) ?**  
  Un ordinateur personnel n'est pas un serveur tournant 24/7. L'utilisateur peut éteindre son PC à n'importe quel moment, changer d'horaires ou faire plusieurs sessions dans la même journée. Une tâche planifiée à heure fixe échouerait la moitié du temps ou déclencherait des sauvegardes à vide.

### La Solution Retenue : Le Déclenchement Explicite (`/save` / Bouton UI)
La sauvegarde est déclenchée sur demande (via la commande `/save` ou un bouton dédié dans l'interface) :
1. **Déclenchement :** L'utilisateur valide la fin d'une session d'échange.
2. **Extraction & Synthèse :** Le LLM prend l'ensemble de la discussion courante, en extrait les faits marquants, les décisions et les événements clés sans le bruit conversationnel.
3. **Incrémentation :** Cette synthèse est proprement formatée et ajoutée à la suite du fichier `journal_recent.txt`.

---

## ⚙️ 2. Le Script MCP de Rotation & Auto-Évolutif (Au démarrage)

À chaque lancement de Maya, un script d'arrière-plan dédié analyse le fichier `journal_recent.txt` :

```text
[ Démarrage de Maya ] ──► [ Scan du journal_recent.txt ]
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        ▼                                                       ▼
[ Date > 30 jours ? ]                               [ Analyse des Récurrences ]
   ├─► OUI : Transfert vers journal_ancien.txt         └─► Détection d'habitudes / traits
   └─► NON : Maintien dans journal_recent.txt                   │
                                                                ▼
                                                    [ Proposition de MAJ ]
                                                    └─► Inscription dans core.txt
```

* **Gestion des 30 Jours :** Les blocs de conversations de plus de 30 jours sont automatiquement coupés de `journal_recent.txt` et archivés dans `journal_ancien.txt`.
* **Recherche en Archives :** Le LLM sait qu'il possède ce `journal_ancien.txt`. Si l'utilisateur lui pose une question sur un événement lointain, Maya exécute une lecture ciblée du fichier d'archives.
* **Auto-Évolution du Caractère :** Lors du balayage, le script détecte les répétitions d'habitudes ou de préférences. Si un comportement devient systématique, le script génère une suggestion de modification dans `core.txt` pour ancrer ce trait dans la personnalité permanente de Maya.

---

## 📂 Structure des Fichiers dans le Projet

```text
maya/
└── memory/
    ├── core.txt            # Identité profonde (Injecté)
    ├── journal_recent.txt  # 30 derniers jours (Injecté)
    └── journal_ancien.txt  # Archives historiques (Consulté à la demande)
```
