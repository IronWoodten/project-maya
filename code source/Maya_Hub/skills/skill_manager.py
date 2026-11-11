"""
skills/skill_manager.py

Compétences de Maya : petites fiches (mots-clés + contenu distillé) qui sont injectées
dans le prompt UNIQUEMENT quand le message de l'utilisateur les concerne.

- Aucun modèle, aucun embedding : matching par mots-clés pondérés en Python pur (moins d'1 ms).
- Le Hub ne cherche JAMAIS la phrase entière : seuls les mots-clés des compétences comptent, le reste du
  message (« salut Maya, comment ça va... ») est ignoré.
- Stockage : skills/skills.json (modifiable à la main avec le Bloc-notes, rechargé tout seul).
- Création automatique : le plugin mémoire appelle add_from_memory() à chaque souvenir
  sauvegardé (recherche web avec sources, ou synthèse de mission d'autonomie).
- Instancié par main.py au démarrage du Hub (get_skill_manager()).
"""

import json
import os
import re
import threading
import time
import unicodedata
from datetime import datetime

try:
    from core.logger import setup_logger
    logger = setup_logger("SkillManager")
except Exception:  # pragma: no cover - repli si le logger du Hub est indisponible
    import logging
    logger = logging.getLogger("SkillManager")

SKILLS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "skills.json")

# --- Réglages (volontairement serrés pour garder Maya ultra réactive) ---
MAX_SKILLS_PER_MATCH = 2      # maximum par message ; la 2e n'est gardée que si elle apporte des mots-clés que la 1re n'a pas
SECOND_RATIO = 0.5            # score minimal de la 2e compétence, en proportion de celui de la 1re

# Pondération des mots-clés : le total doit atteindre le score minimal pour déclencher une compétence.
W_SHARED = 1.0                # mot présent dans plusieurs compétences = sujet récurrent de Maya : suffit seul
W_SINGLE = 0.5                # mot propre à une seule compétence (parfois générique) : il en faut deux
W_STRONG = 1.0                # mot listé dans "strong" d'une compétence : suffit seul
MIN_SCORE_DEFAULT = 1.0       # réglable par compétence : "min_score"

# Contexte : les derniers messages de l'utilisateur prolongent le sujet (« et pour le craft ? »)
CONTEXT_FACTOR = 0.5          # poids d'un mot retrouvé seulement dans les messages précédents
MAX_CONTEXT_MSGS = 2
MAX_CONTEXT_CHARS = 500
MAX_CONTENT_CHARS = 700       # ~200 tokens par compétence
MAX_TOTAL_CHARS = 1400        # budget total injecté par message (~400 tokens)
MAX_TRIGGERS = 8              # mots-clés gardés à la création automatique
MIN_CONFIDENCE = 0.7          # confiance minimale d'un souvenir pour devenir une compétence

# Tags techniques jamais utilisés comme mots-clés
GENERIC_TAGS = {
    "web_research", "mission_synthesis", "research", "synthesis", "knowledge", "memory",
}

# Mots trop banals pour servir de mot-clé (sans accents, minuscules)
STOPWORDS = {
    "dernieres", "derniere", "nouvelles", "nouvelle", "mission", "actu", "actuel", "recherche",
    "infos", "information", "game", "gameplay", "details", "apprendre", "comment", "pour", "dans",
    "avec", "sans", "sur", "quoi", "quel", "quelle", "quels", "quelles", "cette", "cela", "faire",
    "plus", "tout", "tous", "tres", "elle", "vous", "nous", "mais", "donc", "aussi", "etre",
    "avoir", "les", "des", "une", "que", "qui", "quand", "the", "and", "for", "with", "how",
    "what", "about", "from", "this", "that", "web", "research", "2024", "2025", "2026",
    # mots de "demande" trop génériques : ils déclencheraient des compétences hors sujet
    "conseils", "conseil", "astuces", "astuce", "guide", "tips", "tip", "best", "find", "trouver",
    "debuter", "debutant", "beginner", "general", "model",
    "performance", "performances", "test", "tests", "version", "jeu", "jeux", "niveau",
}


# Mots courants qui restent des mots-clés (ils aident à départager des fiches proches) mais ne comptent JAMAIS plus
# que W_SINGLE, même s'ils sont partagés par plusieurs fiches : « résumé », « change », « octobre »... ne doivent pas
# déclencher une compétence à eux seuls. (Un mot listé dans "strong" garde son poids plein.)
GENERIC_WORDS = {
    "resume", "resumes", "resumer", "avis", "film", "films", "change", "changer", "update", "updates", "character", "characters", "genre", "overview",
    "cause", "causes", "spoiler", "spoilers", "actualite", "actualites", "fermeture", "studio", "studios", "ranking", "skin", "skins", "unlock", "appearance", "gender", "female", "male",
    "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
}


# ----------------------------------------------------------------------------
# Utilitaires de texte
# ----------------------------------------------------------------------------
def _norm(s) -> str:
    """Minuscules, sans accents, ponctuation -> espaces."""
    s = str(s).lower().replace("œ", "oe").replace("æ", "ae")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _trigger_regex(trigger):
    """Construit la regex d'un mot-clé (None si trop court).
    - mot court (<= 3 lettres) : mot exact ;
    - mot plus long : début de mot (tolère pluriels et conjugaisons : 'debuter' trouve 'debute') ;
    - expression de plusieurs mots : exacte."""
    t = _norm(trigger)
    if len(t) < 3:
        return None
    if " " in t:
        pat = r"\s+".join(re.escape(w) for w in t.split()) + r"(?![a-z0-9])"
    else:
        n = len(t)
        if n <= 3:
            pat = re.escape(t) + r"(?![a-z0-9])"
        else:
            stem = n if n <= 5 else (n - 1 if n <= 7 else n - 2)
            pat = re.escape(t[:stem]) + r"[a-z0-9]*"
    return re.compile(r"(?<![a-z0-9])" + pat)


def _clip(text, limit):
    text = re.sub(r"\s+", " ", str(text)).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    dot = cut.rfind(". ")
    if dot >= limit * 0.5:
        return cut[:dot + 1]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > 0 else cut).rstrip(",;:") + "…"


def _clean_triggers(tags):
    out, seen = [], set()
    for tag in tags or []:
        raw = str(tag).strip().lower()
        if not raw or raw in GENERIC_TAGS or "_" in raw:
            continue
        t = _norm(raw)
        if len(t) < 3 or t.isdigit() or t in STOPWORDS or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= MAX_TRIGGERS:
            break
    return out


# Une recherche qui n'a rien trouvé ne doit JAMAIS devenir une compétence (sinon Maya répète « rien trouvé »).
_USELESS_RE = re.compile(
    r"do(?:es)? not (?:provide|contain|mention|include)|(?:no|not any) (?:specific |relevant |useful )?information"
    r"|not (?:provided|mentioned|available)|could not find|couldn t find|unable to find"
    r"|aucun resultat|aucune information|rien trouve|pas d information"
)


def _is_useless(content):
    """Vrai si le texte (ses ~160 premiers caractères) dit qu'il n'y a pas d'information."""
    return bool(_USELESS_RE.search(_norm(str(content)[:160])))


def _log(message):
    """Journal du Hub + console de l'interface (jamais bloquant)."""
    try:
        logger.info(message)
    except Exception:
        pass
    try:
        from core.api import log_event
        log_event("learning", "Compétences", message)
    except Exception:
        pass


# ----------------------------------------------------------------------------
# Gestionnaire
# ----------------------------------------------------------------------------
class SkillManager:
    def __init__(self, path=SKILLS_FILE):
        self.path = path
        self._lock = threading.RLock()
        self._mtime = 0.0
        self._data = {"version": 1, "memory_imported": False, "skills": []}
        self._compiled = []  # [(skill, [regex, ...])]
        self._bad_file_logged = False
        with self._lock:
            self._load(force=True)

    # --- fichier -----------------------------------------------------------
    def _load(self, force=False):
        try:
            mtime = os.path.getmtime(self.path)
        except OSError:
            # Fichier absent : on le crée vide
            self._save()
            return
        if not force and mtime == self._mtime:
            return
        self._mtime = mtime
        try:
            with open(self.path, "r", encoding="utf-8-sig") as f:  # utf-8-sig : tolère le Bloc-notes
                data = json.load(f)
            if not isinstance(data, dict) or not isinstance(data.get("skills"), list):
                raise ValueError("le fichier doit contenir un objet avec une liste \"skills\"")
            self._data = data
            self._bad_file_logged = False
            self._compile()
        except Exception as e:
            # Fichier invalide (ex : faute de frappe à la main) : on garde la version en mémoire
            if not self._bad_file_logged:
                self._bad_file_logged = True
                _log(f"⚠️ skills.json illisible, version précédente conservée : {e}")

    def _save(self):
        tmp = self.path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
            os.replace(tmp, self.path)
            self._mtime = os.path.getmtime(self.path)
            self._compile()
        except Exception as e:
            _log(f"❌ Écriture de skills.json impossible : {e}")

    @staticmethod
    def _as_list(value):
        if isinstance(value, str):
            return [value]
        return list(value) if isinstance(value, (list, tuple)) else []

    @staticmethod
    def _min_score(skill):
        try:
            if "min_score" in skill:
                return max(0.1, float(skill["min_score"]))
            if "min_hits" in skill:  # ancien réglage : N mots-clés distincts
                return max(0.1, float(skill["min_hits"]) * W_SINGLE)
        except (TypeError, ValueError):
            pass
        return MIN_SCORE_DEFAULT

    def _compile(self):
        """Prépare les regex et pondère chaque mot-clé selon le nombre de compétences qui le partagent."""
        prepared, df = [], {}
        for skill in self._data.get("skills", []):
            if not isinstance(skill, dict) or skill.get("enabled", True) is False:
                continue
            if not str(skill.get("content", "")).strip():
                continue
            if skill.get("keep_useless") is not True and _is_useless(skill.get("content", "")):
                continue  # fiche issue d'une recherche sans résultat : ignorée (mettre "keep_useless": true pour la garder)
            strong = {_norm(t) for t in self._as_list(skill.get("strong"))}
            rxs = {}
            for trig in self._as_list(skill.get("triggers")) + self._as_list(skill.get("strong")):
                key = _norm(trig)
                if key in rxs:
                    continue
                rx = _trigger_regex(trig)
                if rx:
                    rxs[key] = rx
            if not rxs:
                continue
            prepared.append((skill, rxs, strong))
            for key in rxs:
                df[key] = df.get(key, 0) + 1

        compiled = []
        for skill, rxs, strong in prepared:
            trigs = [
                (key, rx, W_STRONG if (key in strong or (df[key] >= 2 and key not in GENERIC_WORDS)) else W_SINGLE)
                for key, rx in rxs.items()
            ]
            compiled.append((skill, trigs, self._min_score(skill)))
        self._compiled = compiled

    # --- matching ----------------------------------------------------------
    def match(self, text, context=None, max_skills=MAX_SKILLS_PER_MATCH):
        """Retourne les compétences à injecter pour ce message.
        - Score = somme des poids des mots-clés retrouvés (message actuel : poids plein ; messages précédents : moitié).
        - Au moins un mot-clé doit être dans le message actuel (le contexte seul ne déclenche jamais rien).
        - La 2e compétence n'est gardée que si elle apporte des mots-clés que la 1re n'a pas."""
        msg = _norm(str(text)[:2000])
        if not msg:
            return []
        ctx = []
        for c in (context or [])[-MAX_CONTEXT_MSGS:]:
            n = _norm(str(c)[:MAX_CONTEXT_CHARS])
            if n:
                ctx.append(n)
        with self._lock:
            self._load()
            compiled = self._compiled

        scored = []
        for skill, trigs, need in compiled:
            score, matched, in_current = 0.0, set(), 0
            for key, rx, weight in trigs:
                if rx.search(msg):
                    score += weight
                    matched.add(key)
                    in_current += 1
                elif ctx and any(rx.search(c) for c in ctx):
                    score += weight * CONTEXT_FACTOR
                    matched.add(key)
            if in_current and score >= need:
                stamp = str(skill.get("updated") or skill.get("created") or "")
                scored.append((score, stamp, skill, matched))
        if not scored:
            return []

        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        top_score = scored[0][0]
        out, used, covered = [], 0, set()
        for score, _, skill, matched in scored:
            if len(out) >= max_skills:
                break
            if out and (score < top_score * SECOND_RATIO or not (matched - covered)):
                continue
            room = MAX_TOTAL_CHARS - used
            if room < 200:
                break
            content = _clip(skill.get("content", ""), min(MAX_CONTENT_CHARS, room))
            if not content:
                continue
            out.append({
                "id": skill.get("id", ""),
                "name": str(skill.get("name", "")).strip(),
                "content": content,
                "score": round(score, 2),
            })
            used += len(content)
            covered |= matched
        return out

    # --- création ----------------------------------------------------------
    def _upsert_locked(self, name, triggers, content, source_memory_id=None):
        """Ajoute ou met à jour (même ensemble de mots-clés) sans sauvegarder. Retourne (skill, created)."""
        key = tuple(sorted(_norm(t) for t in triggers))
        now = datetime.now().isoformat(timespec="seconds")
        for skill in self._data["skills"]:
            if isinstance(skill, dict) and tuple(sorted(_norm(t) for t in skill.get("triggers", []))) == key:
                skill["content"] = content
                skill["updated"] = now
                if source_memory_id is not None:
                    skill["source_memory_id"] = source_memory_id
                return skill, False
        existing_ids = {s.get("id") for s in self._data["skills"] if isinstance(s, dict)}
        n = int(time.time() * 1000)
        while f"auto-{n}" in existing_ids:
            n += 1
        skill = {
            "id": f"auto-{n}",
            "name": name,
            "enabled": True,
            "triggers": list(triggers),
            "content": content,
            "created": now,
        }
        if source_memory_id is not None:
            skill["source_memory_id"] = source_memory_id
        self._data["skills"].append(skill)
        return skill, True

    def _skill_from_memory(self, mem):
        """Règle de décision unique : quels souvenirs deviennent des compétences. Retourne (name, triggers, content) ou None."""
        if not isinstance(mem, dict):
            return None
        mtype = str(mem.get("type", "")).lower()
        try:
            conf = float(mem.get("confidence", 0) or 0)
        except (TypeError, ValueError):
            conf = 0.0
        content = str(mem.get("content", "")).strip()
        sources = mem.get("source") or []
        if not content or conf < MIN_CONFIDENCE or _is_useless(content):
            return None
        # Recherche web avec sources, ou synthèse de mission. Les souvenirs perso (type "knowledge", etc.) sont exclus.
        if not ((mtype == "research" and sources) or mtype == "synthesis"):
            return None
        triggers = _clean_triggers(mem.get("tags"))
        if len(triggers) < 2:
            return None
        name = " ".join(triggers[:4])
        return name, triggers, _clip(content, MAX_CONTENT_CHARS)

    def add_from_memory(self, mem):
        """Appelé par le plugin mémoire à chaque souvenir sauvegardé. Retourne la compétence ou None."""
        parsed = self._skill_from_memory(mem)
        if not parsed:
            return None
        name, triggers, content = parsed
        with self._lock:
            self._load()
            skill, created = self._upsert_locked(name, triggers, content, mem.get("id"))
            self._save()
        _log(f"🧩 Compétence {'créée' if created else 'mise à jour'} : {skill['name']} ({len(triggers)} mots-clés)")
        return skill

    def import_memories_once(self, memory_file):
        """Import unique des souvenirs déjà présents dans memory_data.json. Retourne le nombre de compétences créées."""
        with self._lock:
            self._load()
            if self._data.get("memory_imported"):
                return 0
            try:
                with open(memory_file, "r", encoding="utf-8-sig") as f:
                    memories = json.load(f)
            except FileNotFoundError:
                memories = []
            except Exception as e:
                _log(f"⚠️ Import des souvenirs impossible (sera retenté au prochain lancement) : {e}")
                return 0
            count = 0
            for mem in memories if isinstance(memories, list) else []:
                parsed = self._skill_from_memory(mem)
                if parsed:
                    name, triggers, content = parsed
                    _, created = self._upsert_locked(name, triggers, content, mem.get("id"))
                    count += 1 if created else 0
            self._data["memory_imported"] = True
            self._save()
        _log(f"🧩 Import initial : {count} compétence(s) créée(s) depuis la mémoire.")
        return count

    # --- documents (fiches de connaissance créées par skills/doc_ingest.py) ----
    def add_document(self, doc_key, title, title_keywords, sections):
        """Crée (ou remplace) les compétences d'UN document : une compétence par section.
        sections = [{"name": ..., "keywords": [...], "content": ...}, ...]. Retourne le nombre de compétences créées.
        Un document renvoyé sous le même nom remplace sa fiche précédente (pas de doublons)."""
        tkw = _clean_triggers(title_keywords)
        now = datetime.now().isoformat(timespec="seconds")
        new = []
        with self._lock:
            self._load()
            self._data["skills"] = [s for s in self._data["skills"]
                                    if not (isinstance(s, dict) and s.get("source_doc") == doc_key)]
            existing_ids = {s.get("id") for s in self._data["skills"] if isinstance(s, dict)}
            n = int(time.time() * 1000)
            for i, sec in enumerate(sections or []):
                content = _clip(sec.get("content", ""), MAX_CONTENT_CHARS)
                if not content:
                    continue
                trig = _clean_triggers(sec.get("keywords"))
                if i == 0:  # vue d'ensemble : les mots du titre suffisent à la déclencher
                    trig = _clean_triggers(tkw + trig)
                if not trig:
                    trig = list(tkw)
                if not trig:
                    continue
                while f"doc-{n}" in existing_ids:
                    n += 1
                existing_ids.add(f"doc-{n}")
                skill = {
                    "id": f"doc-{n}",
                    "name": f"{title} — {sec.get('name') or 'résumé'}"[:120],
                    "enabled": True,
                    "triggers": trig,
                    "content": content,
                    "min_score": 0.5,  # un mot-clé précis du document suffit
                    "created": now,
                    "source_doc": doc_key,
                }
                if i == 0 and tkw:
                    skill["strong"] = list(tkw)
                new.append(skill)
            if not new:
                return 0
            self._data["skills"].extend(new)
            self._save()
        _log(f"📄 Fiche de document « {title} » : {len(new)} compétence(s) créée(s)")
        return len(new)

    # --- consultation ------------------------------------------------------
    def count(self):
        with self._lock:
            self._load()
            return len(self._compiled)

    def list_skills(self):
        with self._lock:
            self._load()
            return [
                {
                    "id": s.get("id"),
                    "name": s.get("name"),
                    "enabled": s.get("enabled", True),
                    "triggers": s.get("triggers", []),
                    "chars": len(str(s.get("content", ""))),
                }
                for s in self._data.get("skills", []) if isinstance(s, dict)
            ]


# --- Instance unique (une seule par processus : main.py la crée au démarrage) ---
_instance = None
_instance_lock = threading.Lock()


def get_skill_manager():
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = SkillManager()
        return _instance
