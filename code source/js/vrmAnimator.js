import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLOADER.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '../node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.js';

const vrmaLoader = new GLTFLoader();
vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

const animationCache = new Map();

// 🦾🦵 Correction posturale VRM — réglable en direct via les sliders d'options.
// Remplace l'ancien correctif figé dans les tracks d'animation : au lieu de modifier
// les keyframes du clip (nécessite de recharger l'anim à chaque changement), on applique
// une rotation additive sur les bones à chaque frame, dans applyPoseCorrection().
// Valeur par défaut de armSpreadAngle = ancien correctif codé en dur (0.05625 rad) pour
// ne rien changer visuellement pour les modèles déjà bien réglés.
let armSpreadAngle = 0.05625;
let legSpreadAngle = 0;

export function setArmSpread(value) {
    armSpreadAngle = Number(value) || 0;
}
export function setLegSpread(value) {
    legSpreadAngle = Number(value) || 0;
}
export function getArmSpread() {
    return armSpreadAngle;
}
export function getLegSpread() {
    return legSpreadAngle;
}

const _poseAxisZ = new THREE.Vector3(0, 0, 1);
const _poseQuat = new THREE.Quaternion();

function nudgeBone(vrm, boneName, angle) {
    if (!angle) return;
    const humanoid = vrm && vrm.humanoid;
    if (!humanoid) return;
    // getRawBoneNode = bone réel du squelette (ce que l'animation manipule).
    // Fallback sur getNormalizedBoneNode pour compat anciennes versions de three-vrm.
    const bone = (humanoid.getRawBoneNode && humanoid.getRawBoneNode(boneName))
        || (humanoid.getNormalizedBoneNode && humanoid.getNormalizedBoneNode(boneName));
    if (!bone) return;
    _poseQuat.setFromAxisAngle(_poseAxisZ, angle);
    bone.quaternion.multiply(_poseQuat);
}

/**
 * À appeler chaque frame, APRÈS mixer.update()/vrm.update(), pour rajouter
 * l'écart bras/jambes réglé par l'utilisateur par-dessus l'animation en cours.
 * Fonctionne avec n'importe quelle animation (dance, idle, sitting…) sans
 * avoir à toucher aux clips eux-mêmes.
 */
export function applyPoseCorrection(vrm = activeVRM) {
    if (!vrm) return;
    nudgeBone(vrm, 'leftUpperArm', armSpreadAngle);
    nudgeBone(vrm, 'rightUpperArm', -armSpreadAngle);
    nudgeBone(vrm, 'leftUpperLeg', -legSpreadAngle);
    nudgeBone(vrm, 'rightUpperLeg', legSpreadAngle);
}

let activeVRM = null;
let activeMixer = null;
let currentAction = null;
let currentAnimKey = null;

let lastDanceKey = null;
let lastIdleKey = null;
let lastSittingKey = null;

let currentIdleMode = 'standing';
export let isSwitchingAnimation = false;

let blinkTimer = 0;
let nextBlinkTime = Math.random() * 3 + 2;

const DANCE_KEYS = [
    'dance_belly', 'dance_hiphop', 'dance_northern', 
    'dance_rumba', 'dance_tiktok', 'dance_tiktok2'
];

const IDLE_KEYS = ['idle', 'idle2'];
const SITTING_KEYS = ['sitting1', 'sitting2', 'sitting3'];

export const ANIMATIONS = {
    dance_belly: { name: '💃 Danse du Ventre', url: './animations_vrm/dance_belly.vrma', loop: true, expression: 'happy' },
    dance_hiphop: { name: '🕺 Hip-Hop', url: './animations_vrm/dance_hiphop.vrma', loop: true, expression: 'happy' },
    dance_northern: { name: '💃 Danse Nordique', url: './animations_vrm/dance_northern.vrma', loop: true, expression: 'happy' },
    dance_rumba: { name: '💃 Rumba', url: './animations_vrm/dance_rumba.vrma', loop: true, expression: 'happy' },
    dance_tiktok: { name: '🎵 Danse TikTok 1', url: './animations_vrm/dance_tiktok.vrma', loop: true, expression: 'happy' },
    dance_tiktok2: { name: '🎶 Danse TikTok 2', url: './animations_vrm/dance_tiktok2.vrma', loop: true, expression: 'happy' },

    sitting1: { name: '🪑 Position Assise 1', url: './animations_vrm/Sitting(1).vrma', loop: true, expression: 'relaxed' },
    sitting2: { name: '🪑 Position Assise 2', url: './animations_vrm/Sitting(2).vrma', loop: true, expression: 'relaxed' },
    sitting3: { name: '🪑 Position Assise 3', url: './animations_vrm/Sitting(3).vrma', loop: true, expression: 'relaxed' },

    idle: { name: '🧘 Repos Calme (Idle 1)', url: './animations_vrm/Idle.vrma', loop: true, expression: 'neutral' },
    idle2: { name: '🧘 Repos Mouvement (Idle 2)', url: './animations_vrm/Idle2.vrma', loop: true, expression: 'neutral' },

    waving: { name: '👋 Faire un signe', url: './animations_vrm/Waving.vrma', loop: false, expression: 'happy' },
    acknowledging: { name: '🫡 Acquiescer', url: './animations_vrm/Acknowledging.vrma', loop: false, expression: 'happy' },
    nod: { name: '👍 Hocher la tête', url: './animations_vrm/nod.vrma', loop: false, expression: 'happy' },
    no: { name: '👎 Signe Non', url: './animations_vrm/No.vrma', loop: false, expression: 'angry' },
    thankful: { name: '🙏 Merci', url: './animations_vrm/Thankful.vrma', loop: false, expression: 'happy' },
    thinking: { name: '🤔 Réfléchir', url: './animations_vrm/Thinking.vrma', loop: true, expression: 'relaxed' },
    kiss: { name: '😘 Bisou', url: './animations_vrm/Kiss.vrma', loop: false, expression: 'kiss' },
    jog: { name: '🏃 Petite Course', url: './animations_vrm/Jog.vrma', loop: true, expression: 'happy' },

    happy: { name: '😊 Joie', url: './animations_vrm/Happy.vrma', loop: true, expression: 'happy' },
    sad: { name: '😢 Tristesse', url: './animations_vrm/sad.vrma', loop: true, expression: 'sad' },
    angry: { name: '😡 En colère', url: './animations_vrm/Angry.vrma', loop: true, expression: 'angry' },
    bashful: { name: '😳 Timide', url: './animations_vrm/Bashful.vrma', loop: true, expression: 'bashful' },
    talking: { name: '🗣️ Parler', url: './animations_vrm/Talking.vrma', loop: true, expression: 'happy' }
};

ANIMATIONS.deny = ANIMATIONS.no;
ANIMATIONS.think = ANIMATIONS.thinking;
ANIMATIONS.wave = ANIMATIONS.waving;
ANIMATIONS.salute = ANIMATIONS.acknowledging;
ANIMATIONS.thanks = ANIMATIONS.thankful;
ANIMATIONS.run = ANIMATIONS.jog;

const FACIAL_EXPRESSIONS = {
    happy: { happy: 1.0 },
    sad: { sad: 1.0 },
    angry: { angry: 1.0 },
    bashful: { relaxed: 0.8, happy: 0.4 },
    kiss: { ou: 0.8, happy: 0.3 },
    relaxed: { relaxed: 0.8 },
    neutral: {}
};

function setVRMExpressionValue(vrm, expressionName, value) {
    if (!vrm) return;
    if (vrm.expressionManager) {
        vrm.expressionManager.setValue(expressionName, value);
    } else if (vrm.blendShapeProxy) {
        vrm.blendShapeProxy.setValue(expressionName, value);
    }
}

export function resetVRMExpressions(vrm = activeVRM) {
    if (!vrm) return;
    const presets = ['happy', 'sad', 'angry', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh'];
    presets.forEach(preset => setVRMExpressionValue(vrm, preset, 0));
}

export function applyExpressionByKey(key, vrm = activeVRM) {
    if (!vrm) return;
    resetVRMExpressions(vrm);

    const animConfig = ANIMATIONS[key];
    const exprKey = animConfig ? (animConfig.expression || key) : key;
    const exprData = FACIAL_EXPRESSIONS[exprKey];

    if (exprData) {
        Object.entries(exprData).forEach(([preset, val]) => {
            setVRMExpressionValue(vrm, preset, val);
        });
    }
}

export function updateVRMExpressions(deltaTime, vrm = activeVRM) {
    if (!vrm) return;

    blinkTimer += deltaTime;
    if (blinkTimer >= nextBlinkTime) {
        let blinkProgress = (blinkTimer - nextBlinkTime) * 12;
        let blinkValue = Math.sin(blinkProgress * Math.PI);

        if (blinkValue <= 0) {
            blinkValue = 0;
            blinkTimer = 0;
            nextBlinkTime = Math.random() * 4 + 2;
        }
        setVRMExpressionValue(vrm, 'blink', Math.max(0, blinkValue));
    }

    if (vrm.expressionManager) {
        vrm.expressionManager.update();
    }
}

export async function loadAndPlayAnimationVRMA(vrm, mixer, url, fade = 0.35, loop = true) {
    if (vrm) activeVRM = vrm;
    if (mixer) activeMixer = mixer;
    const targetMixer = activeMixer;
    if (!targetMixer || !url) return;

    try {
        isSwitchingAnimation = true;
        let spreadClip;

        if (animationCache.has(url)) {
            spreadClip = animationCache.get(url);
        } else {
            const gltf = await new Promise((resolve, reject) => {
                vrmaLoader.load(url, resolve, undefined, reject);
            });
            
            if (!gltf.userData.vrmAnimations || gltf.userData.vrmAnimations.length === 0) {
                throw new Error("Aucune animation VRM trouvée");
            }
            
            // La correction d'écart bras/jambes n'est plus baquée dans le clip :
            // elle est appliquée à chaque frame par applyPoseCorrection(), ce qui
            // la rend réglable en direct sans avoir à recharger l'animation.
            spreadClip = createVRMAnimationClip(gltf.userData.vrmAnimations[0], activeVRM);
            animationCache.set(url, spreadClip);
        }

        const newAction = targetMixer.clipAction(spreadClip);

        // 1. SI C'EST LA MÊME ANIMATION DÉJÀ EN COURS : Ne rien réinitialiser (Évite le T-Pose)
        if (currentAction === newAction && newAction.isRunning()) {
            isSwitchingAnimation = false;
            return;
        }

        // 2. Préparation de la nouvelle action
        newAction.reset();
        newAction.enabled = true;
        newAction.setEffectiveTimeScale(1);
        newAction.setEffectiveWeight(1);

        if (loop) {
            newAction.setLoop(THREE.LoopRepeat, Infinity);
            newAction.clampWhenFinished = false;
        } else {
            newAction.setLoop(THREE.LoopOnce, 1);
            newAction.clampWhenFinished = true;
        }

        // 3. Fondu croisé direct (crossFadeTo) : Empêche le poids de tomber à 0 (T-pose)
        if (currentAction && currentAction !== newAction && currentAction.isRunning()) {
            newAction.play();
            currentAction.crossFadeTo(newAction, fade, true);
        } else {
            newAction.fadeIn(fade);
            newAction.play();
        }

        currentAction = newAction;

        // Écouteur pour animations à lecture unique
        if (!targetMixer._hasFinishedListener) {
            targetMixer.addEventListener('finished', (e) => {
                if (e.action === currentAction && e.action.loop === THREE.LoopOnce) {
                    resetToIdle();
                }
            });
            targetMixer._hasFinishedListener = true;
        }

        setTimeout(() => {
            isSwitchingAnimation = false;
        }, 150);

    } catch (error) {
        isSwitchingAnimation = false;
        console.error("❌ Erreur VRMA :", error);
        throw error; // Propagations de l'erreur pour déclencher les .catch() si le fichier est introuvable
    }
}
export async function playAnimationByKey(key, vrm = activeVRM, mixer = activeMixer) {
    if (!key) return;
    const cleanKey = key.toLowerCase().trim();

    // Même clé en cours de lecture -> On ne relance pas pour éviter les coupures
    if (currentAnimKey === cleanKey && currentAction && currentAction.isRunning()) {
        return;
    }

    if (cleanKey === 'dance' || cleanKey === 'danse' || cleanKey === 'dance_random') {
        return await playRandomDance(vrm, mixer);
    }

    if (cleanKey === 'idle' || cleanKey === 'idle_random') {
        return await playRandomIdle(vrm, mixer, true);
    }

    if (cleanKey === 'sitting' || cleanKey === 'sit' || cleanKey === 'sasseoir' || cleanKey === 'sitting_random') {
        return await playRandomSitting(vrm, mixer, true);
    }

    const anim = ANIMATIONS[cleanKey];
    if (!anim) {
        console.warn("⚠️ Animation inconnue :", key);
        return;
    }

    currentAnimKey = cleanKey;
    applyExpressionByKey(cleanKey, vrm);
    const shouldLoop = anim.loop !== undefined ? anim.loop : true;
    await loadAndPlayAnimationVRMA(vrm, mixer, anim.url, 0.35, shouldLoop);
}

export async function playRandomDance(vrm = activeVRM, mixer = activeMixer) {
    let availableDances = DANCE_KEYS;
    if (lastDanceKey && DANCE_KEYS.length > 1) {
        availableDances = DANCE_KEYS.filter(k => k !== lastDanceKey);
    }

    const randomKey = availableDances[Math.floor(Math.random() * availableDances.length)];
    lastDanceKey = randomKey;

    console.log("🎲 Danse tirée :", randomKey);
    await playAnimationByKey(randomKey, vrm, mixer);
}

export async function playRandomSitting(vrm = activeVRM, mixer = activeMixer, force = false) {
    if (!force && SITTING_KEYS.includes(currentAnimKey) && currentAction && currentAction.isRunning()) {
        return;
    }

    let availableSittings = SITTING_KEYS;
    if (lastSittingKey && SITTING_KEYS.length > 1) {
        availableSittings = SITTING_KEYS.filter(k => k !== lastSittingKey);
    }

    const randomKey = availableSittings[Math.floor(Math.random() * availableSittings.length)];
    lastSittingKey = randomKey;
    currentAnimKey = randomKey;

    console.log("🪑 Position assise tirée :", randomKey);
    applyExpressionByKey(randomKey, vrm);
    const anim = ANIMATIONS[randomKey];
    await loadAndPlayAnimationVRMA(vrm, mixer, anim.url, 0.35, true);
}

export function setIdleMode(mode, vrm = activeVRM, mixer = activeMixer) {
    if (mode !== 'standing' && mode !== 'sitting') return;
    currentIdleMode = mode;
    console.log(`🪑 Mode repos changé vers : ${currentIdleMode}`);
    resetToIdle();
}

export function getIdleMode() {
    return currentIdleMode;
}

let lastIdleCallTime = 0;

export async function playRandomIdle(vrm = activeVRM, mixer = activeMixer, force = false) {
    if (!force && IDLE_KEYS.includes(currentAnimKey) && currentAction && currentAction.isRunning()) {
        return;
    }

    const now = Date.now();
    if (!force && (now - lastIdleCallTime < 300)) {
        return;
    }
    lastIdleCallTime = now;

    if (currentIdleMode === 'sitting') {
        return await playRandomSitting(vrm, mixer, force);
    }

    let availableIdles = IDLE_KEYS;
    if (lastIdleKey && IDLE_KEYS.length > 1) {
        availableIdles = IDLE_KEYS.filter(k => k !== lastIdleKey);
    }

    const randomKey = availableIdles[Math.floor(Math.random() * availableIdles.length)];
    lastIdleKey = randomKey;
    currentAnimKey = randomKey;

    console.log("🧘 Repos debout tiré :", randomKey);
    applyExpressionByKey(randomKey, vrm);
    
    const anim = ANIMATIONS[randomKey];
    await loadAndPlayAnimationVRMA(vrm, mixer, anim.url, 0.4, true);
}

export async function resetToIdle() {
    console.log("🧘 Reset forcé vers IDLE");
    currentAnimKey = null;
    await playRandomIdle(activeVRM, activeMixer, true);
}

window.resetToIdle = resetToIdle;
window.stopTalking = resetToIdle;
window.updateVRMExpressions = (deltaTime) => updateVRMExpressions(deltaTime, activeVRM);
window.playVRMAnimation = (animKey) => playAnimationByKey(animKey, activeVRM, activeMixer);
window.playRandomSitting = () => playRandomSitting(activeVRM, activeMixer, true);
window.setIdleMode = (mode) => setIdleMode(mode, activeVRM, activeMixer);
window.getIdleMode = () => getIdleMode();

window.setVRMArmSpread = (value) => setArmSpread(value);
window.setVRMLegSpread = (value) => setLegSpread(value);
window.getVRMArmSpread = () => getArmSpread();
window.getVRMLegSpread = () => getLegSpread();