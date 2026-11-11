import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '../node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import { loadAndPlayAnimationVRMA, playRandomIdle, applyPoseCorrection, setArmSpread, setLegSpread } from './vrmAnimator.js';

console.log("🚀 Initialisation du Studio VRM complet...");

const ACTIVE_VRM_KEY = 'vrm_active_model_url';
const POSE_OFFSETS_KEY = 'vrm_pose_offsets';
const ROTATION_OFFSETS_KEY = 'vrm_rotation_offsets';
const DEFAULT_ARM_SPREAD = 0.05625;
const DEFAULT_LEG_SPREAD = 0;

function readRotationOffsets() {
    try {
        return JSON.parse(localStorage.getItem(ROTATION_OFFSETS_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Orientation (rotation Y = "faire face", rotation X = inclinaison) sauvegardée par
// modèle VRM. Certains vieux VRM se chargent de dos : l'utilisateur les retourne à la
// souris (Alt + glisser) une fois, et ce réglage est mémorisé pour ce modèle précis.
function getRotationForModel(url) {
    const offsets = readRotationOffsets();
    const saved = offsets[url];
    return {
        rotY: saved && typeof saved.rotY === 'number' ? saved.rotY : 0,
        rotX: saved && typeof saved.rotX === 'number' ? saved.rotX : 0
    };
}

export function saveRotationForModel(url, rotY, rotX) {
    if (!url) return;
    const offsets = readRotationOffsets();
    offsets[url] = { rotY, rotX };
    localStorage.setItem(ROTATION_OFFSETS_KEY, JSON.stringify(offsets));
}

// Retourne le modèle actif de 180° (raccourci pour les VRM qui se chargent de dos)
// et sauvegarde immédiatement le nouvel angle pour ce modèle.
export function flipCurrentVrm180() {
    targetRotationY += Math.PI;
    saveRotationForModel(getCurrentVrmUrl(), targetRotationY, targetRotationX);
}

function readPoseOffsets() {
    try {
        return JSON.parse(localStorage.getItem(POSE_OFFSETS_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Réglage de posture (écart bras/jambes) sauvegardé par modèle VRM, pour que
// chaque utilisateur n'ait à ajuster qu'une fois par modèle importé.
function getPoseOffsetForModel(url) {
    const offsets = readPoseOffsets();
    const saved = offsets[url];
    return {
        arm: saved && typeof saved.arm === 'number' ? saved.arm : DEFAULT_ARM_SPREAD,
        leg: saved && typeof saved.leg === 'number' ? saved.leg : DEFAULT_LEG_SPREAD
    };
}

export function savePoseOffsetForModel(url, arm, leg) {
    if (!url) return;
    const offsets = readPoseOffsets();
    offsets[url] = { arm, leg };
    localStorage.setItem(POSE_OFFSETS_KEY, JSON.stringify(offsets));
}

export function getCurrentVrmUrl() {
    return localStorage.getItem(ACTIVE_VRM_KEY) || '';
}

export let currentVrm = null;
export let mixer = null;

let _currentVrm = null;
let _mixer = null;

let vrmCenterY = 0.85; 
let vrmHeight = 1.6;

// Mémorise la dernière émotion déclenchée pour éviter de relancer
// inutilement l'expression + l'animation quand rien n'a changé (anti-saccade)
let lastTriggeredTag = null;

let blinkTimer = 0;
let nextBlinkInterval = getNextBlinkInterval();
let isBlinking = false;
let blinkProgress = 0;
let isDoubleBlink = false;
let doubleBlinkPhase = 0;

function getNextBlinkInterval() {
    return 2.0 + Math.random() * 3.5;
}

const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(window.devicePixelRatio);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20.0);
window.vrmCamera = camera; // Exposition globale pour le Hit-Testing Overlay

const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(1.0, 2.0, 1.0);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.8));

const clock = new THREE.Clock();

/**
 * Nettoie le texte des balises [tag] et extrait les émotions.
 */
export function parseTags(text) {
    if (!text) return '';
    const tags = [];
    const cleanText = text.replace(/\[(.*?)\]/g, (match, tag) => {
        tags.push(tag);
        return '';
    }).trim();

    const res = new String(cleanText);
    res.cleanText = cleanText;
    res.tags = tags;
    return res;
}

export function recalculateCameraFit() {
    if (!_currentVrm || !_currentVrm.scene) return;

    // Sauvegarde des transformations actuelles
    const currentScale = _currentVrm.scene.scale.clone();
    const currentPos = _currentVrm.scene.position.clone();
    const currentRot = _currentVrm.scene.rotation.clone();

    // Réinitialisation temporaire pour calculer la hauteur brute réelle sans échelle
    _currentVrm.scene.scale.set(1, 1, 1);
    _currentVrm.scene.position.set(0, 0, 0);
    _currentVrm.scene.rotation.set(0, 0, 0);
    _currentVrm.scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(_currentVrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Restauration des transformations d'origine
    _currentVrm.scene.scale.copy(currentScale);
    _currentVrm.scene.position.copy(currentPos);
    _currentVrm.scene.rotation.copy(currentRot);
    _currentVrm.scene.updateMatrixWorld(true);

    if (size.y > 0) {
        vrmHeight = size.y;
        vrmCenterY = center.y;
    }

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const verticalDistance = (vrmHeight / 2) / Math.tan(fovRad / 2);
    const horizontalDistance = verticalDistance / (camera.aspect > 0 ? camera.aspect : 1);
    const fitDistance = Math.max(verticalDistance, horizontalDistance) * 1.15;

    camera.position.set(0, vrmCenterY, fitDistance);
    camera.lookAt(0, vrmCenterY, 0);
}

function attachCanvas() {
    const container = document.querySelector('.vrm-character-area') || document.body;
    if (container && !renderer.domElement.parentElement) {
        container.appendChild(renderer.domElement);
    }
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    
    if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        recalculateCameraFit();
    }
}

if (typeof ResizeObserver !== 'undefined') {
    const container = document.querySelector('.vrm-character-area');
    if (container) {
        const resizeObserver = new ResizeObserver(() => attachCanvas());
        resizeObserver.observe(container);
    }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;
let isRotating = false;

let previousMouseX = 0;
let previousMouseY = 0;

const targetPosition = new THREE.Vector3(0, 0, 0);
let targetScale = 1.0;
const MIN_SCALE = 0.1, MAX_SCALE = 10.0;

let previousPositionX = 0;
let velocityX = 0;

let targetRotationY = 0;
let targetRotationX = 0;

function updateMouseCoords(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerDown(event) {
    if (event.button !== 0 || !_currentVrm || !_currentVrm.scene) return;

    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(_currentVrm.scene, true);
    
    if (intersects.length > 0) {
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;

        if (event.altKey) {
            isRotating = true;
            isDragging = false;
        } else {
            isDragging = true;
            isRotating = false;
        }
    }
}

function onPointerMove(event) {
    if (!isDragging && !isRotating) return;

    const deltaX = event.clientX - previousMouseX;
    const deltaY = event.clientY - previousMouseY;

    previousMouseX = event.clientX;
    previousMouseY = event.clientY;

    if (isRotating) {
        targetRotationY += deltaX * 0.008;
        targetRotationX += deltaY * 0.008;
        targetRotationX = THREE.MathUtils.clamp(targetRotationX, -Math.PI / 3, Math.PI / 3);

    } else if (isDragging) {
        if (event.shiftKey) {
            targetPosition.z += deltaY * 0.005;
        } else {
            targetPosition.x += deltaX * 0.004;
            targetPosition.y -= deltaY * 0.004;
        }
    }
}

function onPointerUp() {
    const wasRotating = isRotating;
    isDragging = false;
    isRotating = false;

    // On ne sauvegarde que la rotation (pas la position/l'échelle), et seulement
    // si l'utilisateur vient de tourner le modèle (Alt + glisser).
    if (wasRotating) {
        saveRotationForModel(getCurrentVrmUrl(), targetRotationY, targetRotationX);
    }
}

function onWheel(event) {
    if (!_currentVrm || !_currentVrm.scene) return;
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    targetScale = THREE.MathUtils.clamp(targetScale * zoomFactor, MIN_SCALE, MAX_SCALE);
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', onPointerUp);
renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

window.addEventListener('resize', attachCanvas);

window.savePoseOffsetForModel = savePoseOffsetForModel;
window.getCurrentVrmUrl = getCurrentVrmUrl;
window.flipCurrentVrm180 = flipCurrentVrm180;

let audioCtx = null;
let audioAnalyser = null;
let audioDataArray = null;
let currentMediaSource = null;

export function setupAudioLipSync(audioElement, isLastPhrase = false) {
    if (!audioElement) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioAnalyser = audioCtx.createAnalyser();
            audioAnalyser.fftSize = 256;
            audioAnalyser.smoothingTimeConstant = 0.4;
            audioAnalyser.connect(audioCtx.destination);
            audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (currentMediaSource) {
            try { currentMediaSource.disconnect(); } catch (e) {}
            currentMediaSource = null;
        }

        currentMediaSource = audioCtx.createMediaElementSource(audioElement);
        currentMediaSource.connect(audioAnalyser);

        audioElement.addEventListener('ended', () => {
            if (currentMediaSource) {
                try { currentMediaSource.disconnect(); } catch (e) {}
                currentMediaSource = null;
            }
            // Ne passe en idle QUE si c'est explicitement la toute dernière phrase de la prise de parole.
            if (isLastPhrase === true) {
                resetToIdle();
            }
        }, { once: true });

        audioElement.addEventListener('pause', () => {
            const mgr = _currentVrm?.expressionManager || _currentVrm?.blendShapeProxy;
            if (mgr) resetMouthExpressions(mgr);
        });

        console.log("🎤 Lip-sync Audio initialisé propre");
    } catch (e) {
        console.warn("⚠️ Lip-sync audio :", e);
    }
}

function resetMouthExpressions(mgr) {
    if (!mgr) return;
    const mouthMorphs = ['aa', 'ih', 'ou', 'ee', 'oh', 'a', 'i', 'u', 'e', 'o', 'A', 'I', 'U', 'E', 'O'];
    mouthMorphs.forEach(name => {
        try {
            if (mgr.setValue) mgr.setValue(name, 0);
        } catch (e) {}
    });
}

function applyVowel(mgr, name10, name0x, targetValue, speed) {
    let currentValue = 0;
    if (mgr.getValue) {
        currentValue = mgr.getValue(name10) ?? mgr.getValue(name0x) ?? mgr.getValue(name0x.toUpperCase()) ?? 0;
    }
    const newValue = THREE.MathUtils.lerp(currentValue, targetValue, speed);
    if (mgr.setValue) {
        mgr.setValue(name10, newValue);
        mgr.setValue(name0x, newValue);
        mgr.setValue(name0x.toUpperCase(), newValue);
    }
}

function updateLipSync() {
    if (!audioAnalyser || !_currentVrm || !audioDataArray) return;
    const mgr = _currentVrm.expressionManager || _currentVrm.blendShapeProxy;
    if (!mgr) return;

    audioAnalyser.getByteFrequencyData(audioDataArray);

    let totalSum = 0;
    for (let i = 0; i < audioDataArray.length; i++) totalSum += audioDataArray[i];
    const volumeAvg = totalSum / audioDataArray.length;

    if (volumeAvg < 10) {
        resetMouthExpressions(mgr);
        return;
    }

    let lowSum = 0, midSum = 0, highSum = 0;
    for (let i = 1; i <= 4; i++) lowSum += audioDataArray[i];
    for (let i = 5; i <= 10; i++) midSum += audioDataArray[i];
    for (let i = 11; i <= 22; i++) highSum += audioDataArray[i];

    const lowAvg = lowSum / 4;
    const midAvg = midSum / 6;
    const highAvg = highSum / 12;

    const maxEnergy = Math.max(lowAvg, midAvg, highAvg, 1);
    const mouthAmplitude = Math.min(0.65, (volumeAvg - 8) / 35.0);

    let targetA = (midAvg / maxEnergy) * mouthAmplitude;
    let targetI = (highAvg / maxEnergy) * mouthAmplitude;
    let targetO = (lowAvg / maxEnergy) * mouthAmplitude;

    if (midAvg < maxEnergy * 0.75) targetA *= 0.15;
    if (highAvg < maxEnergy * 0.75) targetI *= 0.15;
    if (lowAvg < maxEnergy * 0.75) targetO *= 0.15;

    if (targetA < 0.1 && targetI < 0.1 && targetO < 0.1 && volumeAvg > 12) {
        targetA = Math.min(0.5, volumeAvg / 45.0);
    }

    const speed = 0.35;
    applyVowel(mgr, 'aa', 'a', targetA, speed);
    applyVowel(mgr, 'ih', 'i', targetI, speed);
    applyVowel(mgr, 'oh', 'o', targetO, speed);
}

function updateAutoBlink(delta) {
    if (!_currentVrm) return;
    const mgr = _currentVrm.expressionManager || _currentVrm.blendShapeProxy;
    if (!mgr) return;

    if (!isBlinking) {
        blinkTimer += delta;
        if (blinkTimer >= nextBlinkInterval) {
            isBlinking = true;
            blinkTimer = 0;
            blinkProgress = 0;
            isDoubleBlink = Math.random() < 0.15;
            doubleBlinkPhase = 0;
        }
        return;
    }

    const blinkDuration = 0.15;
    blinkProgress += delta / blinkDuration;

    let value = 0;
    if (blinkProgress <= 0.5) {
        value = blinkProgress / 0.5;
    } else if (blinkProgress <= 1.0) {
        value = (1.0 - blinkProgress) / 0.5;
    } else {
        if (isDoubleBlink && doubleBlinkPhase === 0) {
            doubleBlinkPhase = 1;
            blinkProgress = 0;
            value = 0;
        } else {
            isBlinking = false;
            blinkTimer = 0;
            nextBlinkInterval = getNextBlinkInterval();
            value = 0;
        }
    }

    try {
        if (mgr.setValue) {
            mgr.setValue('blink', value);
            mgr.setValue('blinkLeft', value);
            mgr.setValue('blinkRight', value);
            mgr.setValue('BLINK', value);
        }
    } catch (e) {}
}

export function resetExpressions() {
    if (!_currentVrm) return;
    const mgr = _currentVrm.expressionManager || _currentVrm.blendShapeProxy;
    if (!mgr) return;

    const expressionsToReset = [
        'happy', 'joy', 'angry', 'sad', 'sorrow', 'relaxed', 'surprised', 'surprise',
        'blush', 'embarrassed', 'shy', 'gene', 'genee', 'Blush', 'Embarrassed',
        'Happy', 'Joy', 'Angry', 'ANGRY', 'Sad', 'Sorrow', 'Relaxed', 'Surprised', 'Mad', 'Frown', 'frown',
        'BrowDownLeft', 'BrowDownRight', 'MouthFrownLeft', 'MouthFrownRight', 'NoseSneerLeft', 'NoseSneerRight',
        'aa', 'ih', 'ou', 'ee', 'oh', 'a', 'i', 'u', 'e', 'o'
    ];

    expressionsToReset.forEach(exp => {
        try {
            if (mgr.setValue) mgr.setValue(exp, 0);
        } catch (e) {}
    });

    try {
        const registeredNames = mgr._expressionMap 
            ? Object.keys(mgr._expressionMap) 
            : (mgr._blendShapeGroups ? Object.keys(mgr._blendShapeGroups) : []);
        registeredNames.forEach(expName => {
            try { mgr.setValue(expName, 0); } catch (e) {}
        });
    } catch (e) {}
}

export function resetToIdle() {
    if (!_currentVrm || !_mixer) return;
    lastTriggeredTag = null; // Réinitialise pour permettre une future émotion
    resetExpressions();
    playRandomIdle(_currentVrm, _mixer, true);
}

export function triggerEmotion(tag) {
    if (!_currentVrm) return;

    const rawTag = (tag || 'talking').toLowerCase().trim();
    const cleanTag = rawTag.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Anti-saccade : si c'est déjà l'émotion en cours, on garde l'animation active sans la couper
    if (cleanTag === lastTriggeredTag) {
        return;
    }
    lastTriggeredTag = cleanTag;

    resetExpressions();
    const mgr = _currentVrm.expressionManager || _currentVrm.blendShapeProxy;

    let targetAnimation = 'Talking.vrma';

    const setExp = (keys, val = 1.0) => {
        if (!mgr) return;
        const keyList = Array.isArray(keys) ? keys : [keys];

        keyList.forEach(k => {
            try { if (mgr.setValue) mgr.setValue(k, val); } catch (e) {}
        });
    };

    if (mgr) {
        switch (cleanTag) {
            case 'happy':
            case 'joy':
            case 'joie':
                setExp(['happy', 'Joy', 'Happy'], 0.4);
                targetAnimation = 'Happy.vrma';
                break;

            case 'kiss':
            case 'bisou':
            case 'bise':
                setExp(['ou'], 0.8);
                setExp(['happy', 'Happy'], 0.3);
                targetAnimation = 'Kiss.vrma';
                break;

            case 'sad':
            case 'sorrow':
            case 'triste':
                setExp(['sad', 'SAD', 'sorrow', 'Sad'], 1.0);
                targetAnimation = 'sad.vrma';
                break;

            case 'angry':
            case 'colere':
            case 'fache':
            case 'fachee':
                setExp(['angry', 'Angry', 'ANGRY', 'mad'], 1.0);
                setExp(['BrowDownLeft', 'BrowDownRight'], 1.0);
                setExp(['MouthFrownLeft', 'MouthFrownRight'], 0.7);
                targetAnimation = 'No.vrma';
                break;

            case 'relaxed':
            case 'calme':
                setExp(['relaxed', 'Relaxed', 'neutral'], 1.0);
                targetAnimation = 'Idle.vrma';
                break;

            case 'surprised':
            case 'surprise':
                setExp(['Surprised', 'surprised', 'surprise'], 1.0);
                targetAnimation = 'Acknowledging.vrma';
                break;

            case 'gene':
            case 'genee':
            case 'blush':
            case 'embarrassed':
            case 'shy':
            case 'timide':
                setExp(['blush', 'embarrassed', 'shy', 'gene', 'genee'], 0.65);
                setExp(['happy', 'Happy'], 0.25);
                setExp(['Surprised'], 0.15);
                targetAnimation = 'Bashful.vrma';
                break;

            case 'thankful':
            case 'remercie':
                setExp(['happy', 'Happy'], 0.5);
                targetAnimation = 'Thankful.vrma';
                break;

            case 'waving':
            case 'wave':
            case 'hello':
            case 'salut':
                setExp(['happy', 'Happy'], 0.5);
                targetAnimation = 'Waving.vrma';
                break;

            case 'nod':
            case 'yes':
                setExp(['happy', 'Happy'], 0.5);
                targetAnimation = 'nod.vrma';
                break;

            case 'no':
                setExp(['angry', 'Angry', 'BrowDownLeft', 'BrowDownRight'], 0.6);
                targetAnimation = 'No.vrma';
                break;

            case 'thinking':
                setExp(['relaxed', 'Relaxed'], 0.5);
                targetAnimation = 'Thinking.vrma';
                break;

            case 'idle':
                targetAnimation = 'Idle.vrma';
                break;

            case 'talking':
            default:
                targetAnimation = 'Talking.vrma';
                break;
        }
    }

    // 2. 🛡️ SÉCURITÉ POSTURE ASSISE
    // Si Maya est assise ('sitting'), on garde le visage mais on bloque le mouvement debout
    const isSitting = typeof window.getIdleMode === 'function' && window.getIdleMode() === 'sitting';

    if (isSitting) {
        return;
    }

    // 3. Lancement de l'animation corps (seulement si debout)
    if (typeof window.playVRMAnimation === 'function') {
        window.playVRMAnimation(targetAnimation);
    }

    // Lance l'animation d'émotion en boucle (loop = true)
    loadAndPlayAnimationVRMA(_currentVrm, _mixer, `/animations_vrm/${targetAnimation}`, 0.5, true)
        .catch((err) => console.warn("⚠️ Impossible de charger l'animation VRMA :", targetAnimation, err));
}

// =========================================================
// HABITS : couches de vêtements affichables / masquables (menu clic droit)
// Les couches sont détectées automatiquement via les noms de matériaux VRoid
// (N00_<slot>_<..>_<Pièce>_<..>_<TYPE>) : tout ce qui n'est pas SKIN / EYE / FACE / HAIR
// est une couche. Coût : 0 Mo de VRAM en plus, < 1 ms par bascule (simple visible = false).
// =========================================================
const OUTFIT_KEY_PREFIX = 'maya_vrm_outfit_hidden:';
const OUTFIT_NON_LAYER_KINDS = ['SKIN', 'EYE', 'FACE', 'HAIR'];
const OUTFIT_LABELS_FR = {
    Onepiece: 'Robe', Tops: 'Haut', Bottoms: 'Bas', Shoes: 'Chaussures',
    Socks: 'Chaussettes', Legwear: 'Collants', Gloves: 'Gants', Accessory: 'Accessoire'
};
const OUTFIT_HIDDEN_LAYER = 31; // couche three.js que la caméra ne voit pas (et que le raycaster ignore)

let outfitLayers = [];
let outfitModelUrl = '';

// Certains VRoid exportent la peau du corps "trouée" (alpha = 0) sous les vêtements (bras, torse).
// Si on retire le vêtement, on voit alors à travers le corps. Dès qu'une couche est masquée,
// on ignore donc l'alpha de la peau du corps (alphaTest = 0) ; tout remis = réglage d'origine.
let outfitBodySkinMats = [];       // { mat, origAlphaTest }
let outfitSkinOpaqueApplied = false;

function refreshBodySkinAlpha() {
    const anyHidden = outfitLayers.some(l => !l.visible && !l.legs);
    if (anyHidden === outfitSkinOpaqueApplied) return;
    outfitSkinOpaqueApplied = anyHidden;
    outfitBodySkinMats.forEach(e => {
        e.mat.alphaTest = anyHidden ? 0 : e.origAlphaTest;
        e.mat.needsUpdate = true; // recompile le shader une fois (micro-saccade possible à la 1re bascule)
    });
}

function readHiddenOutfit(url) {
    try {
        const arr = JSON.parse(localStorage.getItem(OUTFIT_KEY_PREFIX + url) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}

function saveHiddenOutfit() {
    const hidden = outfitLayers.filter(l => !l.visible).map(l => l.id);
    try {
        if (hidden.length) localStorage.setItem(OUTFIT_KEY_PREFIX + outfitModelUrl, JSON.stringify(hidden));
        else localStorage.removeItem(OUTFIT_KEY_PREFIX + outfitModelUrl);
    } catch (e) { /* stockage indisponible : on ignore */ }
}

// ---------------------------------------------------------
// Chaussettes / collants : dans les VRM VRoid ils sont PEINTS dans la texture de la peau du corps
// (ce ne sont pas des objets séparés). On génère donc une 2e version de la texture où les jambes
// sont repeintes couleur peau, et la couche « Chaussettes / collants » échange les deux textures.
// Coût : VRAM constante (seule la texture utilisée est sur le GPU, l'autre est libérée),
// ~16 Mo de RAM (CPU) en plus, génération unique au chargement (~100-200 ms),
// puis < 20 ms par bascule (ré-envoi de la texture au GPU).
// ---------------------------------------------------------
const OUTFIT_LEGS_ID = '__legs__';
const OUTFIT_LEGS_LABEL = 'Chaussettes / collants';
const OUTFIT_LEGS_CUT_RATIO = 0.9;    // on repeint les triangles du corps situés sous 90 % de la hauteur de hanche
const OUTFIT_LEGS_MIN_PAINTED = 0.2;  // la couche n'est proposée que si ≥ 20 % des triangles de jambe sont "peints"
let outfitLegs = null;                // { origMap, bareMap }

function copyTextureParams(dst, src) {
    ['wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'flipY', 'rotation', 'channel'].forEach(k => {
        if (k in src && src[k] !== undefined) dst[k] = src[k];
    });
    if ('colorSpace' in src) dst.colorSpace = src.colorSpace;
    if ('encoding' in src) dst.encoding = src.encoding;
    if (src.offset) dst.offset.copy(src.offset);
    if (src.repeat) dst.repeat.copy(src.repeat);
    if (src.center) dst.center.copy(src.center);
}

function setupLegsLayer(vrm, bodyMesh) {
    if (outfitLegs && outfitLegs.bareMap) outfitLegs.bareMap.dispose();
    outfitLegs = null;
    if (!bodyMesh || !outfitBodySkinMats.length) return null;

    const mainMat = outfitBodySkinMats[0].mat;
    const map = mainMat.map;
    const img = map && map.image;
    const w = img && (img.width || img.naturalWidth);
    const h = img && (img.height || img.naturalHeight);
    if (!w || !h) return null;

    const hum = vrm.humanoid;
    const bone = hum && ((hum.getRawBoneNode && hum.getRawBoneNode('leftUpperLeg')) || (hum.getBoneNode && hum.getBoneNode('leftUpperLeg')));
    if (!bone) return null;
    vrm.scene.updateMatrixWorld(true);
    const hipY = bodyMesh.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).y;
    if (!(hipY > 0.1)) return null;
    const cutY = hipY * OUTFIT_LEGS_CUT_RATIO;

    const geo = bodyMesh.geometry;
    const idx = geo.index, pos = geo.attributes.position, uv = geo.attributes.uv;
    if (!idx || !pos || !uv) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const flip = !!map.flipY;
    const frac = (x) => x - Math.floor(x);

    // 1) couleur de chaque triangle (échantillon au centre) + couleur de peau dominante
    const tris = [];
    const buckets = new Map();
    for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        const u = [uv.getX(a), uv.getX(b), uv.getX(c)];
        const v = [uv.getY(a), uv.getY(b), uv.getY(c)];
        const cu = (u[0] + u[1] + u[2]) / 3, cv = (v[0] + v[1] + v[2]) / 3;
        const px = Math.min(w - 1, Math.floor(frac(cu) * w));
        const py = Math.min(h - 1, Math.floor(frac(flip ? 1 - cv : cv) * h));
        const o = (py * w + px) * 4;
        const r = data[o], g = data[o + 1], bl = data[o + 2], al = data[o + 3];
        const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
        tris.push({ cy, u, v, r, g, b: bl, a: al });
        if (al > 200) {
            const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4);
            const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            e.n++; e.r += r; e.g += g; e.b += bl;
            buckets.set(key, e);
        }
    }
    let best = null;
    buckets.forEach(e => { if (!best || e.n > best.n) best = e; });
    if (!best) return null;
    const sr = Math.round(best.r / best.n), sg = Math.round(best.g / best.n), sb = Math.round(best.b / best.n);

    // 2) triangles de jambe et part "peinte" (couleur éloignée de la peau)
    const legs = tris.filter(t => t.cy < cutY);
    if (legs.length < 50) return null;
    const painted = legs.filter(t => t.a > 200 && Math.max(Math.abs(t.r - sr), Math.abs(t.g - sg), Math.abs(t.b - sb)) > 45).length;
    if (painted / legs.length < OUTFIT_LEGS_MIN_PAINTED) return null;

    // 3) repeint les jambes en couleur peau (léger contour pour couvrir les bords des îlots UV)
    ctx.fillStyle = ctx.strokeStyle = `rgb(${sr},${sg},${sb})`;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    legs.forEach(t => {
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
            const X = t.u[k] * w, Y = (flip ? 1 - t.v[k] : t.v[k]) * h;
            if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });

    const bare = new THREE.CanvasTexture(canvas);
    copyTextureParams(bare, map);
    bare.needsUpdate = true;

    // Texture d'ombre MToon : si c'est la même image que la couleur, elle doit aussi être "sans chaussettes"
    // (sinon les chaussettes réapparaissent dans les zones d'ombre). clone() partage la source → un seul envoi GPU.
    const shadeTex = mainMat.shadeMultiplyTexture;
    let origShade = null, bareShade = null;
    if (shadeTex && shadeTex !== map && shadeTex.image === map.image) {
        origShade = shadeTex;
        bareShade = bare.clone();
        copyTextureParams(bareShade, shadeTex);
        bareShade.needsUpdate = true;
    }

    outfitLegs = { origMap: map, bareMap: bare, origShade, bareShade };
    console.log(`🧦 Jambes peintes détectées : ${painted}/${legs.length} triangles (peau ${sr},${sg},${sb}, coupe y<${cutY.toFixed(2)})`);
    return { id: OUTFIT_LEGS_ID, label: OUTFIT_LEGS_LABEL, legs: true, visible: true, meshes: [] };
}

function applyLegsLayer(layer, visible) {
    layer.visible = visible;
    if (!outfitLegs) return;
    const { origMap, bareMap, origShade, bareShade } = outfitLegs;
    const useMap = visible ? origMap : bareMap;
    const useShade = visible ? origShade : bareShade;
    outfitBodySkinMats.forEach(e => {
        const m = e.mat;
        if (m.map === origMap || m.map === bareMap) m.map = useMap;
        if (origShade && (m.shadeMultiplyTexture === origShade || m.shadeMultiplyTexture === bareShade)) m.shadeMultiplyTexture = useShade;
        else if (m.shadeMultiplyTexture === origMap || m.shadeMultiplyTexture === bareMap) m.shadeMultiplyTexture = useMap;
    });
    // libère la copie GPU inutilisée : VRAM constante
    (visible ? bareMap : origMap).dispose();
    if (origShade) (visible ? bareShade : origShade).dispose();
}

function applyOutfitLayer(layer, visible) {
    if (layer.legs) { applyLegsLayer(layer, visible); return; }
    layer.visible = visible;
    layer.meshes.forEach(mesh => {
        if (visible) {
            mesh.visible = true;
            mesh.layers.mask = mesh.userData._outfitOrigMask ?? 1;
        } else {
            if (mesh.userData._outfitOrigMask === undefined) mesh.userData._outfitOrigMask = mesh.layers.mask;
            mesh.visible = false;
            mesh.layers.set(OUTFIT_HIDDEN_LAYER);
        }
    });
    refreshBodySkinAlpha();
}

function setupOutfitLayers(vrm, url) {
    outfitLayers = [];
    outfitModelUrl = url;
    outfitBodySkinMats = [];
    outfitSkinOpaqueApplied = false;
    let bodySkinMesh = null;
    const byId = new Map();

    vrm.scene.traverse((obj) => {
        if (!obj.isMesh) return;
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (!mat || !mat.name) return;
        const baseName = mat.name.replace(/ \(Instance\)$/, '');
        const m = baseName.match(/^N\d+_(\d+)_\d+_([A-Za-z0-9]+)_\d+_([A-Z]+)(?:_\d+)?$/);
        if (!m) return;
        const slot = m[1], part = m[2], kind = m[3];
        if (kind === 'SKIN' && part === 'Body') {
            if (!bodySkinMesh) bodySkinMesh = obj;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(mm => {
                if (mm && !outfitBodySkinMats.some(e => e.mat === mm)) outfitBodySkinMats.push({ mat: mm, origAlphaTest: mm.alphaTest });
            });
        }
        if (OUTFIT_NON_LAYER_KINDS.includes(kind)) return;
        const id = `${slot}_${part}`;
        if (!byId.has(id)) byId.set(id, { id, slot, part, visible: true, meshes: [] });
        byId.get(id).meshes.push(obj);
    });

    const layers = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
    const labelCount = {};
    layers.forEach(l => {
        l.label = OUTFIT_LABELS_FR[l.part] || l.part;
        labelCount[l.label] = (labelCount[l.label] || 0) + 1;
    });
    layers.forEach(l => { if (labelCount[l.label] > 1) l.label = `${l.label} (${l.slot})`; });
    outfitLayers = layers;

    try {
        const legsLayer = setupLegsLayer(vrm, bodySkinMesh);
        if (legsLayer) outfitLayers.push(legsLayer);
    } catch (e) { console.warn('⚠️ Couche chaussettes/collants non initialisée :', e); }

    // Restaure les couches masquées lors de la session précédente (par modèle)
    const hidden = readHiddenOutfit(url);
    outfitLayers.forEach(l => { if (hidden.includes(l.id)) applyOutfitLayer(l, false); });

    console.log('👗 Couches d\'habits détectées :', outfitLayers.map(l => `${l.id} = ${l.label} (${l.meshes.length} mesh)`));
    window.dispatchEvent(new CustomEvent('vrm-outfit-loaded', { detail: getVrmOutfitLayers() }));
}

export function getVrmOutfitLayers() {
    return outfitLayers.map(l => ({ id: l.id, label: l.label, visible: l.visible }));
}

export function setVrmOutfitLayerVisible(id, visible) {
    const layer = outfitLayers.find(l => l.id === id);
    if (!layer) return;
    applyOutfitLayer(layer, !!visible);
    saveHiddenOutfit();
}

export function toggleVrmOutfitLayer(id) {
    const layer = outfitLayers.find(l => l.id === id);
    if (!layer) return;
    setVrmOutfitLayerVisible(id, !layer.visible);
}

export function showAllVrmOutfitLayers() {
    outfitLayers.forEach(l => applyOutfitLayer(l, true));
    saveHiddenOutfit();
}

window.getVrmOutfitLayers = getVrmOutfitLayers;
window.setVrmOutfitLayerVisible = setVrmOutfitLayerVisible;
window.toggleVrmOutfitLayer = toggleVrmOutfitLayer;
window.showAllVrmOutfitLayers = showAllVrmOutfitLayers;

export function loadVRMModel(url) {
    if (!url) return;
    localStorage.setItem(ACTIVE_VRM_KEY, url);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
        url,
        (gltf) => {
            try {
                const vrm = gltf.userData.vrm;
                
                if (_currentVrm) {
                    scene.remove(_currentVrm.scene);
                }

                _currentVrm = vrm;
                _mixer = new THREE.AnimationMixer(vrm.scene);

                currentVrm = _currentVrm;
                mixer = _mixer;

                // Exposition globale du modèle et de la scène pour le Hit-Testing Overlay
                window.vrmModel = _currentVrm;
                window.vrmScene = scene;

                scene.add(vrm.scene);

                targetPosition.set(0, 0, 0);
                vrm.scene.position.copy(targetPosition);
                targetScale = 1.0;
                vrm.scene.scale.set(1, 1, 1);

                // Rotation propre à CE modèle (certains vieux VRM se chargent de dos ;
                // l'utilisateur peut les retourner et ce réglage est mémorisé).
                const savedRotation = getRotationForModel(url);
                targetRotationY = savedRotation.rotY;
                targetRotationX = savedRotation.rotX;
                vrm.scene.rotation.y = targetRotationY;
                vrm.scene.rotation.x = targetRotationX;

                recalculateCameraFit();

                const mgr = vrm.expressionManager || vrm.blendShapeProxy;
                if (mgr) {
                    const registeredNames = mgr._expressionMap 
                        ? Object.keys(mgr._expressionMap) 
                        : (mgr._blendShapeGroups ? Object.keys(mgr._blendShapeGroups) : []);
                    console.log("🎭 Expressions/Blendshapes détectés sur ce modèle VRM :", registeredNames);
                }

                // Applique le réglage d'écart bras/jambes sauvegardé pour CE modèle
                // (ou les valeurs par défaut si c'est la 1ère fois qu'on le charge).
                const poseOffset = getPoseOffsetForModel(url);
                setArmSpread(poseOffset.arm);
                setLegSpread(poseOffset.leg);
                window.dispatchEvent(new CustomEvent('vrm-pose-loaded', { detail: poseOffset }));

                // Couches d'habits (menu clic droit > Habits)
                try { setupOutfitLayers(vrm, url); } catch (e) { console.warn('⚠️ Habits VRM non initialisés :', e); }

                console.log("✅ Modèle VRM chargé et centré :", url);
                resetToIdle();

            } catch (err) {
                console.error("❌ Erreur lors du parsing du VRM :", err);
            }
        },
        undefined,
        (error) => console.error("❌ ERREUR CHARGEMENT VRM :", error)
    );
}

export async function initVRMUI() {
    attachCanvas();

    const vrmSelect = document.getElementById('vrm-select');
    const btnRefresh = document.getElementById('btn-refresh-vrm');
    const vrmFileInput = document.getElementById('vrm-file-input');

    async function refreshVRMList() {
        try {
            const res = await fetch('/api/models');
            const models = await res.json();

            if (vrmSelect) vrmSelect.innerHTML = '';

            if (!models || models.length === 0) {
                if (vrmSelect) vrmSelect.innerHTML = '<option value="./models/basemodel.vrm">Modèle par défaut</option>';
                loadVRMModel('./models/basemodel.vrm');
                return;
            }

            const activeUrl = localStorage.getItem(ACTIVE_VRM_KEY) || models[0].url;

            if (vrmSelect) {
                models.forEach((m) => {
                    const opt = document.createElement('option');
                    opt.value = m.url;
                    opt.textContent = m.name;
                    if (m.url === activeUrl) opt.selected = true;
                    vrmSelect.appendChild(opt);
                });
            }

            loadVRMModel(activeUrl);

        } catch (e) {
            console.warn("API indisponible, chargement du modèle basique local...", e);
            loadVRMModel('./models/basemodel.vrm');
        }
    }

    if (vrmSelect) {
        vrmSelect.addEventListener('change', (e) => {
            const selectedUrl = e.target.value;
            if (!selectedUrl) return;
            localStorage.setItem(ACTIVE_VRM_KEY, selectedUrl);
            loadVRMModel(selectedUrl);
        });
    }

    if (btnRefresh) {
        btnRefresh.addEventListener('click', refreshVRMList);
    }

    if (vrmFileInput) {
        vrmFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('vrm', file);

            try {
                const res = await fetch('/api/upload-vrm', { method: 'POST', body: formData });
                const data = await res.json();

                if (data.url) {
                    localStorage.setItem(ACTIVE_VRM_KEY, data.url);
                    await refreshVRMList();
                }
            } catch (err) {
                alert("Erreur lors de l'enregistrement du fichier VRM.");
            } finally {
                vrmFileInput.value = '';
            }
        });
    }

    await refreshVRMList();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (_mixer) _mixer.update(delta);

    if (_currentVrm && _currentVrm.scene) {
        _currentVrm.update(delta);
        applyPoseCorrection(_currentVrm);

        updateLipSync();
        updateAutoBlink(delta);

        _currentVrm.scene.position.lerp(targetPosition, 0.1);
        _currentVrm.scene.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15);

        _currentVrm.scene.rotation.x = THREE.MathUtils.lerp(_currentVrm.scene.rotation.x, targetRotationX, 0.1);

        if (isDragging) {
            velocityX = _currentVrm.scene.position.x - previousPositionX;
            previousPositionX = _currentVrm.scene.position.x;

            _currentVrm.scene.rotation.z = THREE.MathUtils.lerp(_currentVrm.scene.rotation.z, -velocityX * 2.0, 0.1);
            _currentVrm.scene.rotation.y = THREE.MathUtils.lerp(_currentVrm.scene.rotation.y, targetRotationY - velocityX * 1.0, 0.1);
        } else {
            _currentVrm.scene.rotation.z = THREE.MathUtils.lerp(_currentVrm.scene.rotation.z, 0, 0.1);
            _currentVrm.scene.rotation.y = THREE.MathUtils.lerp(_currentVrm.scene.rotation.y, targetRotationY, 0.1);
        }
    }

    renderer.render(scene, camera);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initVRMUI();
        animate();
    });
} else {
    initVRMUI();
    animate();
}
