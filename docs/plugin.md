# 🎭 Spécifications de l'Interface & Incarnation Vocale — Maya

## 📐 Philosophie & Choix de l'Interface

L'incarnation de Maya repose sur deux exigences majeures : **la fluidité d'interaction en temps réel** et **une présence visuelle non-intrusive**.

Pour valider l'architecture V1, le projet s'appuie sur le socle open-source **OpenLLMVTuber**, choisi pour sa modularité, sa légèreté et sa capacité à basculer en mode *Overlay* (effet "Desktop Pet" qui laisse l'avatar flotter sur le bureau).

---

## 🏗️ Pipeline Audio & Traitement de la Parole

Le flux d'interaction vocale suit un pipeline optimisé pour minimiser la latence globale de réponse :

```text
  [ Utilisateur (Micro) ]
            │
            ▼
  ┌─────────────────┐
  │  Fast-Whisper   │ ──► Conversion Audio ➔ Texte (STT)
  └────────┬────────┘
            │
            ▼
  ┌─────────────────┐
  │  Pipeline Maya  │ ──► Traitement Mémoire + Inférence Gemma 4 (12B) + Hub MCP
  └────────┬────────┘
            │
            ▼
  ┌─────────────────┐
  │    Edge-TTS     │ ──► Conversion Texte ➔ Audio (TTS)
  └────────┬────────┘
            │
            ▼
  [ Avatar Live2D ]   ──► Animation faciale, expressions & Lip-Sync
```

---

## 🎙️ Technologies Vocales (STT & TTS)

### 1. Reconnaissance Vocale (STT) : Fast-Whisper Local
* **Fonctionnement :** Traitement local rapide des entrées micro via l'implémentation Fast-Whisper.
* **Rôle :** Transcrit instantanément la parole en texte avant de transmettre l'instruction au pipeline central.

### 2. Synthèse Vocale (TTS) : Edge-TTS (Choix d'Ingénierie)
Le choix de la synthèse vocale a fait l'objet de tests comparatifs poussés. Plusieurs moteurs TTS locaux à haute fidélité ont été évalués :
* **Modèles lourds testés (ex: Chatterbox, F5-TTS) :** Qualité audio impressionnante mais latence de génération inacceptable pour une conversation fluide. De plus, ils monopolisent une quantité importante de VRAM, entrant en compétition directe avec le moteur LLM (Gemma 4 12B).
* **Modèles légers testés (ex: Supertonic3, OpenVoice) :** Gain de vitesse, mais compromis sur le naturel de la voix peu convaincant.

> 💡 **Solution Retenue : Edge-TTS**  
> Le moteur Edge-TTS a été retenu pour sa réactivité immédiate, sa très faible charge sur les ressources système (libérant 100 % du GPU pour le LLM et les tâches de fond) et son rendu vocal naturel sans surcoût de VRAM.

---

## 🖼️ Incarnation Visuelle & Animation

* **Modèle Actuel :** Avatar Live2D interactif.
* **Lip-Sync Native :** Synchronisation labiale automatique alignée sur le flux audio généré par le TTS.
* **Expressions & Gestuelle :** Déclenchement d'expressions faciales dynamiques en fonction des intentions et du ton générés par le LLM.
* **Mode Overlay :** Intégration transparente sur le bureau Windows, offrant une présence continue et conviviale.

---

## 🔮 Roadmap V2 : Interface Propriétaire & Passage au VRM (3D)

Si le socle OpenLLMVTuber a parfaitement rempli son rôle de prototype fonctionnel (PoC), la version finale du projet intégrera sa propre interface propriétaire :
* **Passage au format VRM (3D) :** Remplacement du moteur Live2D par un moteur 3D VRM pour permettre une meilleure profondeur visuelle, des animations plus complexes et la gestion d'accessoires.
* **Conservation du concept Overlay :** L'interface propriétaire maintiendra le mode "Desktop Pet" tout en réduisant encore davantage la dépendance aux bibliothèques tierces.
