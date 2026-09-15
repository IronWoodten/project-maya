// js/ScreenManager.js

export class ScreenManager {
    constructor() {
        this.stream = null;

        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
        this.videoElement.style.width = '100%';
        this.videoElement.style.height = '100%';
        this.videoElement.style.objectFit = 'cover';
        this.videoElement.style.borderRadius = '8px';

        this.previewContainer = document.getElementById('screen-preview-container');
        this.previewImg = document.getElementById('screen-preview-img');
        this.btnClosePreview = document.getElementById('btn-close-preview');

        if (this.btnClosePreview) {
            this.btnClosePreview.onclick = () => this.stopScreenShare();
        }
    }

    isActive() {
        return !!(this.stream && this.stream.active);
    }

    async toggleScreenShare() {
        if (this.isActive()) {
            this.stopScreenShare();
        } else {
            await this.startScreenShare();
        }
    }

    async startScreenShare() {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: false
            });

            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();

            const track = this.stream.getVideoTracks()[0];
            if (track) {
                track.onended = () => this.stopScreenShare();
            }

            if (this.previewContainer) {
                if (this.previewImg) this.previewImg.style.display = 'none';

                if (!this.previewContainer.contains(this.videoElement)) {
                    this.previewContainer.insertBefore(this.videoElement, this.previewContainer.firstChild);
                }
                
                this.videoElement.style.display = 'block';
                this.previewContainer.classList.add('active');
                console.log("🖥️ [ScreenManager] Flux vidéo démarré et actif.");
            }

        } catch (err) {
            console.warn("⚠️ [ScreenManager] Partage annulé ou refusé :", err);
            this.stopScreenShare();
        }
    }

    stopScreenShare() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.style.display = 'none';
            this.videoElement.srcObject = null;
        }
        if (this.previewImg) {
            this.previewImg.style.display = 'block';
            this.previewImg.src = '';
        }
        if (this.previewContainer) {
            this.previewContainer.classList.remove('active');
        }
        console.log("🖥️ [ScreenManager] Partage d'écran arrêté.");
    }

    async captureFrame() {
        try {
            if (!this.isActive()) {
                console.warn("⚠️ [ScreenManager] Capture impossible : Le partage d'écran est inactif.");
                return null;
            }

            // S'assurer que la vidéo tourne
            if (this.videoElement.paused) {
                await this.videoElement.play();
            }

            const width = this.videoElement.videoWidth || 1280;
            const height = this.videoElement.videoHeight || 720;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.videoElement, 0, 0, width, height);

            const base64 = canvas.toDataURL('image/jpeg', 0.85);
            console.log(`📸 [ScreenManager] Image capturée ! (${width}x${height}px)`);
            return base64;
        } catch (e) {
            console.error("❌ [ScreenManager] Erreur lors de la capture :", e);
            return null;
        }
    }

    getImageData() {
        return this.captureFrame();
    }

    clearPreview() {
        // Laissé vide volontairement pour NE PAS couper le partage
    }
}