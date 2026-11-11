# -*- coding: utf-8 -*-
"""
skills/doc_ingest.py — Documents envoyés à Maya -> fiche de connaissance permanente (compétences).

Principe :
  1. /api/docs/ingest : le texte est extrait SANS LLM (PDF via pypdf, DOCX via zipfile, TXT/MD/CSV/JSON en lecture simple).
     Le texte brut reste en mémoire du Hub le temps du travail ; il n'est écrit nulle part (ni chat, ni journal).
  2. /api/docs/start  : le LLM déjà lancé (llama-server, mêmes paramètres, aucun embedding) rédige une fiche courte
     découpée en sections ; chaque section devient une compétence (skill_manager.add_document).
  3. /api/docs/status : l'interface suit l'avancement (icône qui tourne, puis vu ou erreur).
"""
import io
import os
import re
import threading
import time
import uuid
import zipfile
import xml.etree.ElementTree as ET

import requests

from skills.skill_manager import _clip, _norm, _log

# --- Réglages ---------------------------------------------------------------
MAX_TOTAL_CHARS = 24000          # texte total lu par le LLM (~6-7k tokens) : quelques pages
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_FILES = 5
MAX_SECTIONS = 5
SECTION_MAX_CHARS = 600          # reste sous MAX_CONTENT_CHARS (700) du gestionnaire de compétences
LLM_TIMEOUT = 300                # secondes (GPU parfois occupé par un jeu)
JOB_TTL = 3600                   # un travail oublié est purgé après 1 h
TEXT_EXTS = (".txt", ".md", ".csv", ".json", ".log")

_skill_mgr = None
_endpoint_getter = None
_jobs = {}
_jobs_lock = threading.Lock()


class DocError(Exception):
    pass


def configure(skill_mgr, endpoint_getter):
    """Appelé une fois par main.py. endpoint_getter() renvoie l'URL de llama-server (…/chat/completions)."""
    global _skill_mgr, _endpoint_getter
    _skill_mgr = skill_mgr
    _endpoint_getter = endpoint_getter


# ============================================================
#  Extraction du texte (aucun LLM)
# ============================================================
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _decode(data):
    for enc in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return data.decode("utf-8", "replace")


def _docx_text(data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read("word/document.xml")
    except Exception:
        raise DocError("fichier .docx illisible ou corrompu")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        raise DocError("contenu .docx illisible")
    body = root.find(_W + "body")
    if body is None:
        raise DocError("document Word vide")
    out = []

    def para(p):
        parts = []
        for el in p.iter():
            if el.tag == _W + "t":
                parts.append(el.text or "")
            elif el.tag == _W + "tab":
                parts.append("\t")
            elif el.tag in (_W + "br", _W + "cr"):
                parts.append("\n")
        return "".join(parts).strip()

    def walk(container):
        for el in container:
            if el.tag == _W + "p":
                t = para(el)
                if t:
                    out.append(t)
            elif el.tag == _W + "tbl":
                for tr in el.iter(_W + "tr"):
                    cells = []
                    for tc in tr.findall(_W + "tc"):
                        cell = " ".join(x for x in (para(p) for p in tc.iter(_W + "p")) if x)
                        if cell:
                            cells.append(cell)
                    if cells:
                        out.append(" | ".join(cells))
            elif el.tag == _W + "sdt":
                c = el.find(_W + "sdtContent")
                if c is not None:
                    walk(c)

    walk(body)
    return "\n\n".join(out)


def _pdf_text(data):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise DocError("lecture des PDF indisponible (pypdf n'est pas installé : relance INSTALLER.bat du patch documents)")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise DocError("PDF protégé par mot de passe")
        pages, total = [], 0
        for page in reader.pages:
            try:
                t = page.extract_text() or ""
            except Exception:
                t = ""
            pages.append(t)
            total += len(t)
            if total > MAX_TOTAL_CHARS * 2:  # inutile de lire tout un livre
                break
    except DocError:
        raise
    except Exception:
        raise DocError("PDF illisible ou corrompu")
    return "\n\n".join(pages)


def _clean(text):
    t = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"[ \t\u00a0]+", " ", t)
    t = re.sub(r" ?\n ?", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _cut(text, limit):
    """Coupe proprement (fin de paragraphe ou de phrase). Retourne (texte, coupé?)."""
    if len(text) <= limit:
        return text, False
    cut = text[:limit]
    pos = max(cut.rfind("\n\n"), cut.rfind(". "))
    if pos >= limit * 0.7:
        cut = cut[:pos + 1]
    return cut.rstrip(), True


def extract_text(filename, data):
    name = (filename or "document").lower()
    if len(data) > MAX_FILE_BYTES:
        raise DocError("fichier trop gros (20 Mo maximum)")
    if name.endswith(".pdf"):
        text = _pdf_text(data)
    elif name.endswith(".docx"):
        text = _docx_text(data)
    elif name.endswith(TEXT_EXTS):
        text = _decode(data)
    else:
        raise DocError("format non pris en charge (PDF, DOCX, TXT, MD, CSV, JSON)")
    text = _clean(text)
    if len(text) < 30:
        if name.endswith(".pdf"):
            raise DocError("aucun texte trouvé dans ce PDF (probablement un scan : pas de reconnaissance de caractères)")
        raise DocError("document vide")
    return text


# ============================================================
#  Travaux (en mémoire seulement)
# ============================================================
def _purge():
    now = time.time()
    with _jobs_lock:
        for jid in [j for j, v in _jobs.items() if now - v["created"] > JOB_TTL]:
            _jobs.pop(jid, None)


def ingest(files, want_text=False, auto_start=False):
    """files = [(nom, octets)]. Retourne un dict JSON-able."""
    _purge()
    if not files:
        return {"ok": False, "error": "aucun fichier reçu"}
    if len(files) > MAX_FILES:
        return {"ok": False, "error": f"{MAX_FILES} documents maximum à la fois"}
    per_doc = MAX_TOTAL_CHARS // len(files)
    docs, errors = [], []
    for name, data in files:
        try:
            text = extract_text(name, data)
            text, truncated = _cut(text, per_doc)
            docs.append({"name": os.path.basename(name or "document"), "text": text, "truncated": truncated})
        except DocError as e:
            errors.append({"name": os.path.basename(name or "document"), "error": str(e)})
        except Exception as e:
            errors.append({"name": os.path.basename(name or "document"), "error": f"lecture impossible ({e})"})
    if not docs:
        msg = " ; ".join(f"{e['name']} : {e['error']}" for e in errors) or "aucun document lisible"
        return {"ok": False, "error": msg}
    job_id = uuid.uuid4().hex[:12]
    job = {"id": job_id, "docs": docs, "state": "waiting", "message": "", "created": time.time()}
    with _jobs_lock:
        _jobs[job_id] = job
    _log(f"📄 Document(s) reçu(s) : {', '.join(d['name'] for d in docs)} ({sum(len(d['text']) for d in docs)} caractères)")
    if auto_start:
        start(job_id)
    res = {"ok": True, "job_id": job_id, "errors": errors,
           "names": [d["name"] for d in docs], "truncated": any(d["truncated"] for d in docs)}
    if want_text:
        res["docs"] = [{"name": d["name"], "text": d["text"]} for d in docs]
    return res


def start(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return False
        if job["state"] != "waiting":
            return True  # déjà lancé
        job["state"] = "running"
    threading.Thread(target=_run, args=(job,), daemon=True, name=f"doc-fiche-{job_id}").start()
    return True


def status(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return {"state": "unknown", "message": "travail introuvable (le Hub a peut-être redémarré)"}
        return {"state": job["state"], "message": job["message"]}


# ============================================================
#  Génération de la fiche (LLM déjà lancé)
# ============================================================
SYSTEM_PROMPT = "Tu résumes des documents en fiches de connaissance courtes, exactes et bien structurées."

USER_PROMPT = """Voici un document intitulé « {name} ». Rédige une FICHE DE CONNAISSANCE pour qu'une compagne virtuelle puisse en parler plus tard de mémoire.

Règles :
- Français. Faits précis (noms, chiffres, règles, étapes), aucune opinion, aucune phrase d'introduction.
- De 1 à {max_sections} sections. Chaque section fait 300 à 550 caractères et traite UN sujet distinct. La 1re section est la vue d'ensemble du document.
- Mots-clés : 4 à 6 mots simples en minuscules par section, ceux qu'une personne dirait dans une conversation pour parler de CE sujet précis (pas de mots génériques comme « document », « information », « guide »).

Réponds EXACTEMENT dans ce format, sans rien d'autre :

TITRE: <titre court du document>
MOTS-CLES-TITRE: <2 à 4 mots-clés qui désignent le document dans son ensemble>
### <nom de la section 1>
MOTS-CLES: <mot1, mot2, mot3, mot4>
<contenu de la section 1>
### <nom de la section 2>
MOTS-CLES: <mot1, mot2, mot3, mot4>
<contenu de la section 2>

DOCUMENT :
<<<
{text}
>>>

Rappel : réponds uniquement avec TITRE, MOTS-CLES-TITRE puis les sections « ### » dans le format ci-dessus."""


def _endpoint():
    ep = ""
    try:
        ep = (_endpoint_getter() or "") if _endpoint_getter else ""
    except Exception:
        ep = ""
    ep = ep or "http://127.0.0.1:8080/v1/chat/completions"
    ep = ep.replace("//localhost", "//127.0.0.1")
    if not ep.rstrip("/").endswith("/chat/completions"):
        ep = ep.rstrip("/") + "/chat/completions"
    return ep


def _call_llm(name, text, strict=False):
    user = USER_PROMPT.format(name=name, text=text, max_sections=MAX_SECTIONS)
    if strict:
        user += "\nATTENTION : ta réponse précédente ne respectait pas le format. Commence directement par « TITRE: »."
    payload = {
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
        "temperature": 0.2 if strict else 0.3,
        "max_tokens": 1500,
        "stream": False,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    try:
        r = requests.post(_endpoint(), json=payload, timeout=LLM_TIMEOUT)
    except requests.exceptions.ConnectionError:
        raise DocError("le LLM (llama-server) ne répond pas : il est peut-être coupé")
    except requests.exceptions.Timeout:
        raise DocError("le LLM a mis trop de temps à répondre")
    if r.status_code != 200:
        raise DocError(f"le LLM a refusé la requête (HTTP {r.status_code})")
    try:
        return r.json()["choices"][0]["message"]["content"] or ""
    except Exception:
        raise DocError("réponse du LLM illisible")


def _split_kw(s):
    return [k.strip(" \t\"'«»*-_.") for k in re.split(r"[,;/]", s or "") if k.strip(" \t\"'«»*-_.")]


def _strip_md(s):
    s = re.sub(r"\*\*|__|`", "", s)
    return s.strip()


def parse_fiche(raw, fallback_title):
    """Texte du LLM -> (titre, mots_clés_titre, [sections]). Lève ValueError si inexploitable."""
    raw = re.sub(r"<think>.*?</think>", "", raw or "", flags=re.S | re.I)
    raw = re.sub(r"```[a-z]*", "", raw).strip()
    parts = re.split(r"(?m)^\s*#{2,4}\s*", raw)
    header = parts[0]
    m = re.search(r"(?im)^\W*TITRE\W*:\s*(.+)$", header)
    title = _strip_md(m.group(1)) if m else ""
    m = re.search(r"(?im)^\W*MOTS[-_ ]?CL[EÉ]S[-_ ]?TITRE\W*:\s*(.+)$", header)
    tkw = _split_kw(_strip_md(m.group(1))) if m else []
    sections = []
    for block in parts[1:]:
        lines = block.strip().split("\n")
        name = _strip_md(lines[0])[:80] if lines else ""
        rest = "\n".join(lines[1:])
        kw = []
        km = re.search(r"(?im)^\W*MOTS[-_ ]?CL[EÉ]S\W*:\s*(.+)$", rest)
        if km:
            kw = _split_kw(_strip_md(km.group(1)))
            rest = rest[:km.start()] + rest[km.end():]
        content = _clip(_strip_md(rest), SECTION_MAX_CHARS)
        if len(content) >= 40:
            sections.append({"name": name or "résumé", "keywords": kw, "content": content})
    if not sections:
        # Le modèle a oublié les « ### » : on garde le corps du texte comme une seule section.
        body = re.sub(r"(?im)^\W*(TITRE|MOTS[-_ ]?CL[EÉ]S[-_ ]?TITRE|MOTS[-_ ]?CL[EÉ]S)\W*:.*$", "", header)
        content = _clip(_strip_md(body), SECTION_MAX_CHARS)
        if len(content) >= 80:
            sections.append({"name": "résumé", "keywords": tkw, "content": content})
    if not sections:
        raise ValueError("format inattendu")
    title = (title or fallback_title)[:80]
    if not tkw:
        tkw = [w for w in re.findall(r"[A-Za-zÀ-ÿ0-9]{4,}", title)][:3]
    return title, tkw, sections[:MAX_SECTIONS]


def _make_fiche(doc):
    fallback = os.path.splitext(doc["name"])[0]
    last = None
    for strict in (False, True):
        raw = _call_llm(doc["name"], doc["text"], strict=strict)
        try:
            return parse_fiche(raw, fallback)
        except ValueError as e:
            last = e
    raise DocError(f"la fiche n'a pas pu être rédigée ({last})")


def _run(job):
    t0 = time.time()
    done = []
    try:
        if _skill_mgr is None:
            raise DocError("gestionnaire de compétences indisponible")
        for doc in job["docs"]:
            title, tkw, sections = _make_fiche(doc)
            key = "doc:" + _norm(os.path.splitext(doc["name"])[0])
            n = _skill_mgr.add_document(key, title, tkw, sections)
            if n <= 0:
                raise DocError("aucune section exploitable")
            done.append(f"« {title} » ({n} section{'s' if n > 1 else ''})")
        msg = "Fiche enregistrée : " + " ; ".join(done)
        if any(d.get("truncated") for d in job["docs"]):
            msg += " — document long : seul le début a été lu"
        with _jobs_lock:
            job["state"], job["message"] = "done", msg
        _log(f"📄 {msg} en {time.time() - t0:.1f} s")
    except DocError as e:
        with _jobs_lock:
            job["state"], job["message"] = "error", str(e)
        _log(f"⚠️ Fiche de document non enregistrée : {e}")
    except Exception as e:
        with _jobs_lock:
            job["state"], job["message"] = "error", f"erreur inattendue ({e})"
        _log(f"⚠️ Fiche de document non enregistrée : {e}")
    finally:
        job["docs"] = None  # le texte brut ne reste nulle part
