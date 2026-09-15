// js/autolearningUI.js

export function initAutoLearningUI() {
    // 1. Charger les objectifs existants dans la zone de texte au démarrage
    loadGoalsToUI();

    // 2. Attacher l'événement de sauvegarde sur le bouton "Enregistrer tout"
    const saveBtn = document.getElementById('btn-save-prompt') || document.getElementById('btn-save-autolearning');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            await saveGoalsFromUI();
        });
    }
}

async function loadGoalsToUI() {
    const goalsInput = document.getElementById('autolearning-goals-input');
    if (!goalsInput) return;

    try {
        const response = await fetch('/api/goals');
        if (!response.ok) return;

        const data = await response.json();
        if (data && Array.isArray(data.goals)) {
            // Transforme chaque objet JSON en ligne avec un tiret
            const lines = data.goals
                .map(g => `- ${g.name}`)
                .join('\n');

            goalsInput.value = lines;
        }
    } catch (err) {
        console.error("❌ Erreur lors du chargement de goals.json :", err);
    }
}

async function saveGoalsFromUI() {
    const goalsInput = document.getElementById('autolearning-goals-input');
    if (!goalsInput) return;

    const rawText = goalsInput.value;

    // Découpe le texte ligne par ligne, retire les tirets/puces et ignore les lignes vides
    const lines = rawText
        .split('\n')
        .map(line => line.replace(/^[-*•]\s*/, '').trim())
        .filter(line => line.length > 0);

    // Reconstruit le tableau d'objets JSON
    const goalsArray = lines.map((title, index) => ({
        id: `goal_custom_${index + 1}`,
        name: title,
        description: `Recherche autonome sur : ${title}`,
        priority: Math.max(10, 100 - (index * 10)),
        enabled: true,
        last_checked: new Date().toISOString()
    }));

    const payload = { goals: goalsArray };

    try {
        const response = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const statusMsg = document.getElementById('prompt-status-msg');
        if (response.ok) {
            if (statusMsg) {
                statusMsg.textContent = "✅ Paramètres et objectifs enregistrés !";
                statusMsg.style.color = "#2ecc71";
                statusMsg.style.display = "block";
                setTimeout(() => { statusMsg.style.display = "none"; }, 3000);
            }
        } else {
            if (statusMsg) {
                statusMsg.textContent = "❌ Erreur de sauvegarde de goals.json";
                statusMsg.style.color = "#ff4d4d";
                statusMsg.style.display = "block";
                setTimeout(() => { statusMsg.style.display = "none"; }, 3000);
            }
        }
    } catch (err) {
        console.error("❌ Erreur de communication serveur :", err);
    }
}