import os
import re
import shutil
import time
import contextlib
from datetime import datetime
from config import JOURNAL_RECENT, JOURNAL_ANCIEN

# Reconnaît n'importe quel en-tête "=== ... - DATE ===" (ancien format
# "JOURNAL DE MAYA", nouveau "JOURNAL INTIME", ou tout autre plus tard),
# avec date au format DD.MM.YY, DD/MM/YY ou DD/MM/YYYY, et un "Fin
# d'enregistrement" avec ou sans point final.
ENTRY_PATTERN = re.compile(
    r"((?:===[^\n]*?-\s*)?(\d{2}[./]\d{2}[./]\d{2,4})(?:\s*===)?.*?Fin d'enregistrement\.?)",
    re.S
)

LOCK_RETRY_S = 0.05
LOCK_TIMEOUT_S = 5.0


@contextlib.contextmanager
def journal_lock(target_path):
    """Verrou de fichier inter-processus (Node <-> Python) sans dépendance
    externe : un seul processus peut créer le .lock à la fois (O_EXCL),
    l'autre attend et réessaie jusqu'au timeout."""
    lock_path = target_path.with_name(target_path.name + ".lock")
    start = time.time()
    fd = None
    while fd is None:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if time.time() - start > LOCK_TIMEOUT_S:
                raise TimeoutError(
                    "[Archive] Impossible d'obtenir le verrou sur "
                    f"{target_path.name} (occupé depuis plus de {LOCK_TIMEOUT_S}s)"
                )
            time.sleep(LOCK_RETRY_S)
    try:
        yield
    finally:
        os.close(fd)
        try:
            os.remove(lock_path)
        except OSError:
            pass


def _parse_date(date_str: str):
    for fmt in ("%d.%m.%y", "%d/%m/%Y", "%d.%m.%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def archive():
    """Déplace mécaniquement les entrées de > 30 jours vers journal_ancien.txt,
    sans jamais supprimer silencieusement un contenu qui ne correspond pas
    exactement au motif attendu, et sous verrou pour éviter toute collision
    avec une écriture concurrente (ex: server.js qui ajoute une entrée)."""
    if not JOURNAL_RECENT.exists():
        print("[Archive] journal_recent.txt introuvable.")
        return

    try:
        with journal_lock(JOURNAL_RECENT):
            text = JOURNAL_RECENT.read_text(encoding="utf8")

            if not text.strip():
                print("[Archive] Aucun contenu à archiver.")
                return

            matches = list(ENTRY_PATTERN.finditer(text))

            keep = []
            archive_list = []
            leftover_found = False
            today = datetime.today()
            cursor = 0

            for m in matches:
                if m.start() > cursor:
                    gap = text[cursor:m.start()]
                    if gap.strip():
                        leftover_found = True
                        keep.append(gap.strip())
                cursor = m.end()

                block = m.group(1)
                date_str = m.group(2)
                d = _parse_date(date_str)
                if d is None:
                    keep.append(block)
                    continue

                age = (today - d).days
                if age > 30:
                    if block.strip().startswith("==="):
                        archive_list.append(block)
                    else:
                        archive_list.append(f"=== JOURNAL - {date_str} ===\n{block}")
                else:
                    keep.append(block)

            if cursor < len(text):
                tail = text[cursor:]
                if tail.strip():
                    leftover_found = True
                    keep.append(tail.strip())

            if leftover_found:
                print("[Archive] ATTENTION : du texte hors-format a été détecté "
                      "(entrée non terminée, format inattendu...). Il a été conservé "
                      "tel quel dans journal_recent.txt au lieu d'être supprimé.")

            if archive_list:
                JOURNAL_ANCIEN.parent.mkdir(parents=True, exist_ok=True)
                with open(JOURNAL_ANCIEN, "a", encoding="utf8") as f:
                    for x in archive_list:
                        f.write("\n\n" + x.strip())
                print(f"[Archive] {len(archive_list)} entrée(s) transférée(s) dans journal_ancien.txt.")
            else:
                print("[Archive] Aucune entrée de plus de 30 jours à archiver.")

            backup_path = JOURNAL_RECENT.with_name(JOURNAL_RECENT.name + ".bak")
            try:
                shutil.copy2(JOURNAL_RECENT, backup_path)
            except Exception as e:
                print(f"[Archive] Attention : sauvegarde impossible ({e})")

            tmp_path = JOURNAL_RECENT.with_name(JOURNAL_RECENT.name + ".tmp")
            tmp_path.write_text("\n\n".join(keep), encoding="utf8")
            tmp_path.replace(JOURNAL_RECENT)

    except TimeoutError as e:
        print(str(e))
    except Exception as e:
        print(f"[Archive] Erreur : {e}")


if __name__ == "__main__":
    archive()
