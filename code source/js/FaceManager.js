// js/FaceManager.js

export class FaceManager {
    constructor() {
        this.targets = {};    
        this.currents = {};   
        this.decayTimer = null;
        
        this.decayDelay = 4500; 
        this.lerpSpeed = 3.5;   
    }

    parseAndCleanText(text) {
        if (!text) return '';

        const regex = /\[(?:emotion:)?([a-zA-Z0-9_]+)(?:[:|]([0-9.]+))?\]/gi;
        let match;
        const newTargets = {};

        while ((match = regex.exec(text)) !== null) {
            const name = match[1].toLowerCase();
            const value = match[2] !== undefined ? parseFloat(match[2]) : 1.0;
            newTargets[name] = Math.min(Math.max(value, 0), 1);
        }

        if (Object.keys(newTargets).length > 0) {
            this.setTargets(newTargets);
        }

        return text.replace(regex, '').trim();
    }

    setTargets(newTargets) {
        for (const [name, val] of Object.entries(newTargets)) {
            // Sourire doux
            if (name === 'happy' || name === 'smile') {
                this.targets['relaxed'] = val;
            } 
            // Gêne / Timidité : n'ayant pas de blendshape 'blush', on simule l'air timide avec 'relaxed' + 'surprised'
            else if (name === 'gene' || name === 'blush' || name === 'timide') {
                this.targets['relaxed'] = val * 0.6;
                this.targets['surprised'] = val * 0.2;
            } 
            else {
                this.targets[name] = val;
            }
        }

        if (this.decayTimer) clearTimeout(this.decayTimer);
        this.decayTimer = setTimeout(() => {
            this.resetToNeutral();
        }, this.decayDelay);
    }

    resetToNeutral() {
        for (const name in this.targets) {
            this.targets[name] = 0.0;
        }
    }

    update(vrm, deltaTime = 0.016) {
        if (!vrm) return;

        const manager = vrm.expressionManager || vrm.blendShapeProxy;
        if (!manager) return;

        const allKeys = new Set([...Object.keys(this.targets), ...Object.keys(this.currents)]);

        allKeys.forEach(name => {
            const target = this.targets[name] || 0.0;
            const current = this.currents[name] || 0.0;

            const next = current + (target - current) * Math.min(this.lerpSpeed * deltaTime, 1.0);
            this.currents[name] = Math.abs(next) < 0.001 ? 0 : next;

            try {
                if (vrm.expressionManager) {
                    vrm.expressionManager.setValue(name, this.currents[name]);
                } else if (vrm.blendShapeProxy) {
                    vrm.blendShapeProxy.setValue(name, this.currents[name]);
                }
            } catch (e) {}
        });
    }
}