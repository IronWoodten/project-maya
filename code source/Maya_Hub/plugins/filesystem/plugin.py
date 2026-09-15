import ast
import json
import os
import shutil
from typing import Any, Dict
from core.base_plugin import BasePlugin
from core.logger import setup_logger

# Import sécurisé pour les PDF
try:
    from pypdf import PdfReader
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

logger = setup_logger("FileSystemPlugin")


class FileSystemPlugin(BasePlugin):

    id = "filesystem"
    name = "File System Access"
    description = (
        "Accès au système de fichiers du PC (lecture, écriture, déplacement)."
        " ⚠️ ATTENTION : Nécessaire au fonctionnement de la mémoire et du journal"
        " de Maya."
    )

    capabilities = [
        "read_file",
        "write_file",
        "move_file",
        "list_directory",
        "delete_file",
    ]

    tools = {
        "read_file": {
            "description": (
                "Lit le contenu d'un fichier (texte, PDF, journal, mémoires,"
                " code, etc.)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Chemin absolu ou relatif du fichier à lire.",
                    }
                },
                "required": ["path"],
            },
        },
        "write_file": {
            "description": (
                "Écrit ou remplace du texte dans un fichier. Crée les dossiers si"
                " nécessaire."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Chemin du fichier.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Contenu texte à écrire dans le fichier.",
                    },
                },
                "required": ["path", "content"],
            },
        },
        "move_file": {
            "description": "Déplace ou renomme un fichier ou un dossier.",
            "parameters": {
                "type": "object",
                "properties": {
                    "src_path": {
                        "type": "string",
                        "description": "Chemin du fichier source.",
                    },
                    "dest_path": {
                        "type": "string",
                        "description": "Chemin du fichier destination.",
                    },
                },
                "required": ["src_path", "dest_path"],
            },
        },
        "list_directory": {
            "description": (
                "Lyste les fichiers et sous-dossiers contenus dans un répertoire."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Chemin du dossier (par défaut '.').",
                    }
                },
                "required": [],
            },
        },
        "delete_file": {
            "description": "Supprime un fichier spécifique du système.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Chemin du fichier à supprimer.",
                    }
                },
                "required": ["path"],
            },
        },
    }

    def __init__(self, hub=None):
        self.hub = hub
        logger.info("Module FileSystem initialisé avec succès.")

        # 🛡️ LISTE NOIRE : dossiers/fichiers système critiques, interdits en écriture/suppression/déplacement
        # (la lecture reste autorisée pour ne pas bloquer un diagnostic légitime)
        windir = os.environ.get("WINDIR", r"C:\Windows")
        self._blocked_dirs = [
            os.path.normcase(os.path.join(windir, "System32")),
            os.path.normcase(os.path.join(windir, "SysWOW64")),
            os.path.normcase(os.path.join(windir, "Boot")),
            os.path.normcase(os.path.join(windir, "WinSxS")),
            os.path.normcase(os.path.join(windir, "System32", "drivers")),
            os.path.normcase(os.path.join(windir, "System32", "config")),  # ruches du Registre
            os.path.normcase(windir),  # bloque C:\Windows en général (whitelist implicite pour le reste du disque)
            os.path.normcase(r"C:\Program Files\WindowsApps"),
            os.path.normcase(r"C:\$Recycle.Bin"),
            os.path.normcase(r"C:\System Volume Information"),
            os.path.normcase(r"C:\ProgramData\Microsoft\Windows\Start Menu"),
        ]
        self._blocked_files = [
            os.path.normcase(os.path.join(windir, "System32", "drivers", "etc", "hosts")),
            os.path.normcase(r"C:\pagefile.sys"),
            os.path.normcase(r"C:\hiberfil.sys"),
            os.path.normcase(r"C:\swapfile.sys"),
            os.path.normcase(r"C:\bootmgr"),
        ]

    def _is_blocked(self, resolved_path: str) -> bool:
        """Retourne True si le chemin (fichier ou dossier) tombe dans une zone protégée."""
        if not resolved_path:
            return False
        norm = os.path.normcase(os.path.normpath(resolved_path))

        # Fichier explicitement protégé
        if norm in self._blocked_files:
            return True

        # Dossier protégé ou sous-dossier d'un dossier protégé
        for blocked in self._blocked_dirs:
            if norm == blocked or norm.startswith(blocked + os.sep):
                return True

        return False

    def _clean_params(self, params: dict) -> dict:
        """Aplatit les dictionnaires imbriqués et déballe le JSON/texte brut."""
        cleaned = {}
        if not isinstance(params, dict):
            return cleaned

        for k, v in params.items():
            if isinstance(v, dict):
                cleaned.update(v)
            elif (
                isinstance(v, str)
                and v.strip().startswith("{")
                and v.strip().endswith("}")
            ):
                try:
                    parsed = json.loads(v) if '"' in v else ast.literal_eval(v)
                    if isinstance(parsed, dict):
                        cleaned.update(parsed)
                    else:
                        cleaned[k] = v
                except Exception:
                    cleaned[k] = v
            else:
                cleaned[k] = v
        return cleaned

    def _get_param(self, params: dict, keys: list, default: str = "") -> str:
        """Extrait la première valeur non vide parmi une liste d'alias de clés."""
        for k in keys:
            val = params.get(k)
            if val and isinstance(val, str):
                return val
        return default

    def _resolve_path(self, path: str) -> str:
        """Convertit les chemins 'Desktop/...' et les hallucinations LLM 'C:/Users/User/Desktop/...' 
        vers le vrai Bureau de l'utilisateur connecté."""
        if not path:
            return ""

        clean_path = path.strip().replace("/", "\\")
        user_home = os.path.expanduser("~")
        user_desktop = os.path.join(user_home, "Desktop")

        # 🛡️ Redirection automatique si Maya hallucine le nom d'utilisateur
        # (gère "Desktop" en anglais ET "Bureau" en français, avec ou sans
        # sous-chemin derrière, et même si c'est le seul segment du chemin)
        desktop_keywords = ("desktop", "bureau")
        parts = clean_path.split("\\")
        desktop_idx = -1
        for i, part in enumerate(parts):
            if part.lower() in desktop_keywords:
                desktop_idx = i
                break

        if desktop_idx != -1:
            if desktop_idx + 1 < len(parts):
                rel_path = "\\".join(parts[desktop_idx + 1:])
                return os.path.join(user_desktop, rel_path)
            return user_desktop

        return os.path.abspath(os.path.expanduser(clean_path))

    def run(self, action: str, params: Dict[str, Any]) -> Any:
        cleaned_params = self._clean_params(params)
        logger.info(
            f"Action '{action}' reçue par FileSystemPlugin avec params nettoyés:"
            f" {cleaned_params}"
        )

        if action == "read_file":
            path = self._get_param(
                cleaned_params, ["path", "kwargs", "query", "file", "filename"]
            )
            return self.read_file(path)

        elif action == "write_file":
            path = self._get_param(
                cleaned_params, ["path", "kwargs", "query", "file", "filename"]
            )
            content = self._get_param(
                cleaned_params, ["content", "text", "data", "body"]
            )
            return self.write_file(path, content)

        elif action == "move_file":
            src = self._get_param(
                cleaned_params,
                [
                    "src_path",
                    "src",
                    "source",
                    "source_path",
                    "old_path",
                    "file",
                    "path",
                ],
            )
            dest = self._get_param(
                cleaned_params,
                [
                    "dest_path",
                    "dest",
                    "dst",
                    "destination",
                    "target",
                    "new_path",
                    "target_path",
                    "to",
                ],
            )
            return self.move_file(src, dest)

        elif action == "list_directory":
            path = self._get_param(
                cleaned_params,
                ["path", "kwargs", "query", "dir", "directory", "folder"],
                default=".",
            )
            return self.list_directory(path)

        elif action == "delete_file":
            path = self._get_param(
                cleaned_params, ["path", "kwargs", "query", "file", "filename"]
            )
            return self.delete_file(path)

        else:
            logger.warning(f"Action '{action}' inconnue pour FileSystemPlugin.")
            return f"Erreur : l'action '{action}' est inconnue."

    def read_file(self, path: str, max_chars: int = 12000) -> str:
        resolved_path = self._resolve_path(path)
        if not resolved_path:
            return "Erreur : Le chemin du fichier (path) est obligatoire."
        if not os.path.exists(resolved_path):
            return f"Erreur : Le fichier '{resolved_path}' n'existe pas."

        ext = os.path.splitext(resolved_path)[1].lower()
        content = ""

        # Traitement spécifique pour les fichiers PDF
        if ext == ".pdf":
            if not PDF_AVAILABLE:
                return (
                    "Erreur : Le paquet 'pypdf' n'est pas installé. Exécutez 'pip"
                    " install pypdf' sur le serveur backend."
                )

            try:
                reader = PdfReader(resolved_path)
                extracted_pages = []
                for i, page in enumerate(reader.pages):
                    text = page.extract_text()
                    if text:
                        # 🧹 Filtrage strict des octets invisibles / non imprimables
                        clean_page = "".join(
                            ch for ch in text if ch.isprintable() or ch in "\n\r\t"
                        )
                        if clean_page.strip():
                            extracted_pages.append(f"[Page {i + 1}]\n{clean_page.strip()}")

                content = "\n\n".join(extracted_pages)

                if not content.strip():
                    return (
                        f"Le fichier PDF '{resolved_path}' ne contient aucun texte"
                        " extractible (il s'agit peut-être d'un document scanné sous forme"
                        " d'images)."
                    )

            except Exception as e:
                logger.error(f"Erreur lecture PDF '{resolved_path}' : {e}")
                return f"Erreur lors de la lecture du fichier PDF : {e}"

        # Traitement standard pour tous les fichiers texte (.txt, .md, .py, .json, etc.)
        else:
            try:
                with open(resolved_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception as e:
                logger.error(f"Erreur lecture fichier '{resolved_path}' : {e}")
                return f"Erreur lors de la lecture : {e}"

        # 🛡️ Plafond de sécurité pour empêcher les boucles sur fichiers géants
        if len(content) > max_chars:
            total_len = len(content)
            content = (
                content[:max_chars]
                + f"\n\n⚠️ [TEXTE TRONQUÉ : Fichier volumineux ({total_len} caractères). Affichage limité aux {max_chars} premiers caractères.]"
            )

        logger.info(f"📖 Fichier lu avec succès ({len(content)} caractères renvoyés à Maya)")
        return content

    def write_file(self, path: str, content: str) -> str:
        resolved_path = self._resolve_path(path)
        if not resolved_path:
            return "Erreur : Le chemin du fichier (path) est obligatoire."
        if self._is_blocked(resolved_path):
            logger.warning(f"🚫 Écriture bloquée (zone protégée) : {resolved_path}")
            return (
                f"Erreur : Écriture refusée. '{resolved_path}' se trouve dans une zone"
                " système protégée."
            )
        try:
            directory = os.path.dirname(resolved_path)
            if directory:
                os.makedirs(directory, exist_ok=True)

            with open(resolved_path, "w", encoding="utf-8") as f:
                f.write(content)
            logger.info(f"💾 Fichier écrit avec succès : {resolved_path}")
            return f"Fichier '{resolved_path}' enregistré avec succès."
        except Exception as e:
            logger.error(f"Erreur écriture fichier '{resolved_path}' : {e}")
            return f"Erreur lors de l'écriture : {e}"

    def move_file(self, src_path: str, dest_path: str) -> str:
        src_res = self._resolve_path(src_path)
        dest_res = self._resolve_path(dest_path)

        if not src_res or not dest_res:
            return (
                f"Erreur : src_path ('{src_path}') et dest_path ('{dest_path}') sont"
                " obligatoires."
            )
        if not os.path.exists(src_res):
            return f"Erreur : Le fichier source '{src_res}' n'existe pas."
        if self._is_blocked(src_res) or self._is_blocked(dest_res):
            logger.warning(f"🚫 Déplacement bloqué (zone protégée) : {src_res} -> {dest_res}")
            return (
                f"Erreur : Déplacement refusé. '{src_res}' ou '{dest_res}' se trouve"
                " dans une zone système protégée."
            )
        try:
            dest_dir = os.path.dirname(dest_res)
            if dest_dir:
                os.makedirs(dest_dir, exist_ok=True)
            shutil.move(src_res, dest_res)
            logger.info(f"🚚 Fichier déplacé : {src_res} -> {dest_res}")
            return f"Déplacé avec succès de '{src_res}' vers '{dest_res}'."
        except Exception as e:
            logger.error(f"Erreur déplacement '{src_res}' : {e}")
            return f"Erreur de déplacement : {e}"

    def list_directory(self, path: str = ".") -> str:
        resolved_path = self._resolve_path(path)
        if not os.path.exists(resolved_path):
            return f"Erreur : Le dossier '{resolved_path}' n'existe pas."
        try:
            items = os.listdir(resolved_path)
            if not items:
                return f"Le dossier '{resolved_path}' est vide."
            return f"Contenu de '{resolved_path}' :\n" + "\n".join(
                f"- {item}" for item in items
            )
        except Exception as e:
            logger.error(f"Erreur listage dossier '{resolved_path}' : {e}")
            return f"Erreur lors du listage : {e}"

    def delete_file(self, path: str) -> str:
        resolved_path = self._resolve_path(path)
        if not resolved_path:
            return "Erreur : Le chemin du fichier (path) est obligatoire."
        if not os.path.exists(resolved_path):
            return f"Erreur : Le fichier '{resolved_path}' n'existe pas."
        if self._is_blocked(resolved_path):
            logger.warning(f"🚫 Suppression bloquée (zone protégée) : {resolved_path}")
            return (
                f"Erreur : Suppression refusée. '{resolved_path}' se trouve dans une"
                " zone système protégée."
            )
        try:
            os.remove(resolved_path)
            logger.info(f"🗑️ Fichier supprimé : {resolved_path}")
            return f"Fichier '{resolved_path}' supprimé avec succès."
        except Exception as e:
            logger.error(f"Erreur suppression '{resolved_path}' : {e}")
            return f"Erreur lors de la suppression : {e}"


def get_instance(hub=None):
    return FileSystemPlugin(hub=hub)