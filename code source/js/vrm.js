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