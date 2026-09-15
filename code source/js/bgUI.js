// js/bgUI.js

// =========================================================================
// 1. INDIQUE ICI LES IMAGES QUE TU AS MISES DANS TON DOSSIER .\backgrounds\
// =========================================================================
const LOCAL_BACKGROUNDS = [
    './backgrounds/image1.jpg',
    './backgrounds/image2.png',
    './backgrounds/image3.png',
    './backgrounds/image4.png',
    // Ex: ajoute ici le nom de tes fichiers dans le dossier backgrounds
];

const DB_NAME = 'vrm_app_db';
const STORE_NAME = 'backgrounds';
const ACTIVE_BG_KEY = 'vrm_active_background';

// Gestion de la base de données intégrée au navigateur
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function addCustomBg(dataUrl) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add({ data: dataUrl, date: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function getCustomBgs() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    } catch (e) {
        return [];
    }
}

async function deleteCustomBg(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function initBgUI() {
    const bgFileInput = document.getElementById('bg-file-input');
    const bgGrid = document.getElementById('bg-grid');
    const vrmArea = document.querySelector('.vrm-character-area');

    if (!bgGrid) return;

    // Charger le fond actif enregistré
    const activeBg = localStorage.getItem(ACTIVE_BG_KEY);
    if (activeBg && vrmArea) {
        applyBackground(activeBg);
    }

    function applyBackground(url) {
        if (!vrmArea) return;
        vrmArea.style.backgroundImage = `url('${url}')`;
        vrmArea.style.backgroundSize = 'cover';
        vrmArea.style.backgroundPosition = 'center';
        vrmArea.style.backgroundRepeat = 'no-repeat';
        localStorage.setItem(ACTIVE_BG_KEY, url);
    }

    async function renderBgGrid() {
        bgGrid.innerHTML = '';

        const customBgs = await getCustomBgs();
        const currentActive = localStorage.getItem(ACTIVE_BG_KEY);

        // A. Afficher d'abord les images du dossier local .\backgrounds\
        LOCAL_BACKGROUNDS.forEach((url) => {
            createCard(url, false, null);
        });

        // B. Afficher les images importées par l'utilisateur
        customBgs.reverse().forEach((item) => {
            createCard(item.data, true, item.id);
        });

        if (LOCAL_BACKGROUNDS.length === 0 && customBgs.length === 0) {
            bgGrid.innerHTML = `<p style="color: #a6adc8; font-size: 0.85rem; text-align: center; grid-column: 1 / -1; padding: 20px 0;">Aucun fond disponible.</p>`;
        }

        function createCard(bgUrl, isCustom, customId) {
            const card = document.createElement('div');
            card.className = 'bg-card';
            const isActive = currentActive === bgUrl;

            card.style.cssText = `
                position: relative;
                width: 100%;
                height: 90px;
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                border: 2px solid ${isActive ? '#89b4fa' : '#313244'};
                background-image: url('${bgUrl}');
                background-size: cover;
                background-position: center;
                transition: transform 0.2s, border-color 0.2s;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            `;

            card.addEventListener('click', () => {
                applyBackground(bgUrl);
                renderBgGrid();
            });

            // Bouton de suppression (seulement pour les images importées)
            if (isCustom) {
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = '&times;';
                deleteBtn.title = 'Supprimer';
                deleteBtn.style.cssText = `
                    position: absolute; top: 4px; right: 4px;
                    background: rgba(237, 135, 150, 0.85); color: #11111b;
                    border: none; border-radius: 50%; width: 22px; height: 22px;
                    font-weight: bold; font-size: 14px; display: flex;
                    align-items: center; justify-content: center; cursor: pointer;
                `;
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteCustomBg(customId);
                    if (localStorage.getItem(ACTIVE_BG_KEY) === bgUrl) {
                        localStorage.removeItem(ACTIVE_BG_KEY);
                        if (vrmArea) vrmArea.style.backgroundImage = 'none';
                    }
                    renderBgGrid();
                });
                card.appendChild(deleteBtn);
            }

            bgGrid.appendChild(card);
        }
    }

    // Gestion de l'import d'image
    if (bgFileInput) {
        bgFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const dataUrl = event.target.result;
                await addCustomBg(dataUrl);
                applyBackground(dataUrl);
                renderBgGrid();
                bgFileInput.value = '';
            };
            reader.readAsDataURL(file);
        });
    }

    renderBgGrid();
}