# ⏱️ Spécifications du Plugin Timer — Maya

## 📐 Philosophie & raison d'être

Le plugin **Timer** permet à Maya de programmer un minuteur à la demande de l'utilisateur, matérialisé par une fenêtre de bureau autonome, puis de réagir vocalement une fois le décompte terminé.

Contrairement aux plugins existants du Hub (DeepSearch, FileSystem, MEMORY), qui répondent tous **dans un tour de conversation déjà ouvert**, le Timer introduit un nouveau cas d'usage : un résultat qui doit atteindre Maya **après coup**, sans qu'aucun échange ne soit en cours.

---

# 🎯 Principe

## Déclenchement

L'utilisateur exprime une demande en langage naturel :

> « Mets-moi un timer de 10 minutes pour le riz »

Le LLM détecte l'intention et appelle le tool `timer.start_timer` avec les paramètres extraits de la phrase.

## Fenêtre indépendante

Le plugin ne dessine rien lui-même : il **spawn un process Python séparé** (`timer_popup.py`, via `pywebview`), totalement indépendant du Hub. La fenêtre continue de tourner même si le Hub redémarre entre-temps.

```text
   Utilisateur
        │
        ▼
   LLM (function-calling)
        │
   timer.start_timer(duration_seconds, label)
        │
        ▼
   ┌─────────────────────┐
   │   Maya Hub / Timer   │
   │       Plugin         │
   └──────────┬───────────┘
              │ subprocess.Popen (détaché)
              ▼
   ┌─────────────────────┐
   │   timer_popup.py     │
   │  (fenêtre pywebview) │
   │  déplaçable/redim.   │
   │  annulable            │
   └──────────┬───────────┘
              │ fin du décompte
              ▼
   ┌─────────────────────┐
   │  POST /api/timer-    │
   │      finished        │
   └──────────┬───────────┘
              │ polling
              ▼
   ┌─────────────────────┐
   │  Interface Maya      │
   │  (nouveau tour LLM)  │
   └──────────┬───────────┘
              │
              ▼
        Maya réagit
       (chat + voix)
```

## Notification de fin

À l'expiration du délai : la fenêtre clignote, émet un signal sonore, puis notifie directement l'interface Maya via une requête HTTP. L'interface récupère cet événement par polling et ouvre un **nouveau tour de conversation** avec le fait brut (`[Minuteur terminé] "riz"`) — jamais une phrase pré-écrite. C'est le LLM qui formule sa réaction, avec le contexte de la conversation en cours, exactement comme pour n'importe quel autre message.

---

# 🛠️ Capacités

**Statut :** ✅ Fonctionnel

| Action | Description |
|---|---|
| `start_timer` | Programme un timer et ouvre la fenêtre correspondante |

### Paramètres

* `duration_seconds` *(obligatoire)* — durée du timer en secondes
* `label` *(optionnel)* — nom affiché sur le timer et repris dans l'événement de fin

Si `duration_seconds` est absent, le plugin renvoie une erreur explicite au LLM plutôt que d'inventer une valeur, ce qui l'amène naturellement à redemander la précision à l'utilisateur.

---

# 🧩 Pourquoi une exception au principe d'isolation du Hub

Le Hub a été conçu pour que les plugins restent isolés du cœur de Maya (voir [`hub.md`](./hub.md) — Principe d'isolation). Le Timer respecte ce principe pour son exécution, mais introduit une brique supplémentaire côté interface :

Le Hub Python n'a accès ni à la conversation en cours, ni au moteur vocal — il ne peut donc pas faire parler Maya de lui-même une fois le décompte terminé. Une route dédiée (`/api/timer-finished`) et un polling léger côté interface ont donc été ajoutés pour permettre à un événement différé de déclencher un tour de conversation.

Cette brique est **générique** : tout futur plugin ayant besoin de notifier Maya après coup (rappel, veille active, alarme...) pourra la réutiliser telle quelle, sans nouvelle modification de l'interface.

---

# 🎨 Rendu visuel

La fenêtre du timer reprend l'identité visuelle de Maya : fond dégradé bleu nuit, anneau de progression circulaire lumineux qui se vide au fil du décompte, glow bleu néon. Entièrement générée en HTML/CSS/JS depuis Python, sans dépendance à un framework front.

---

# 📊 État actuel

| Composant | État |
|---|---|
| Plugin Timer (Hub) | ✅ Fonctionnel |
| Fenêtre autonome (pywebview) | ✅ Fonctionnelle |
| Anneau de progression + signal sonore | ✅ Fonctionnel |
| Notification de fin vers l'interface | ✅ Fonctionnelle |
| Réaction vocale de Maya | ✅ Fonctionnelle |

---

# 🔮 Limites connues

* Communication Hub → interface par **polling simple** (quelques secondes de délai entre la fin du timer et la réaction de Maya, pas de push temps réel).
* Aucune persistance : un timer en cours ne survit pas à la fermeture de sa fenêtre ou à un redémarrage du PC.
* Testé sous Windows uniquement.
