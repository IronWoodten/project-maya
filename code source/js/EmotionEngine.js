/**
 * EmotionEngine.js
 * Responsable du parsing des balises d'émotions [emotion_name]
 */

export class EmotionEngine {
    constructor() {
        this.aliasMap = {
            'wave': 'waving',
            'hello': 'waving',
            'waving': 'waving',
            'salut': 'waving',

            // --- DANSE ---
            'dance': 'dance',
            'danse': 'dance',
            'danser': 'dance',
            'dancing': 'dance',
            'dance_belly': 'dance_belly',
            'dance_hiphop': 'dance_hiphop',
            'dance_northern': 'dance_northern',
            'dance_rumba': 'dance_rumba',

            // --- EXPRESSIONS FACIALES ---
            'happy': 'relaxed',
            'smile': 'relaxed',
            'relaxed': 'relaxed',
            'joy': 'relaxed',
            'joie': 'relaxed',
            'sourire': 'relaxed',

            'sad': 'sad',
            'sorrow': 'sad',
            'triste': 'sad',

            'angry': 'angry',
            'colere': 'angry',
            'fache': 'angry',
            'fachee': 'angry',

            'gene': 'gene',
            'genee': 'gene',
            'blush': 'gene',
            'embarrassed': 'gene',
            'shy': 'gene',
            'timide': 'gene',

            'thankful': 'thankful',
            'remercie': 'thankful',

            'thinking': 'thinking',

            'nod': 'nod',
            'yes': 'nod',
            'no': 'no',

            'surprised': 'surprised',
            'surprise': 'surprised',

            // --- BISOU ---
            'kiss': 'kiss',
            'bisou': 'kiss',
            'bise': 'kiss',
            'smack': 'kiss',
            'baiser': 'kiss',

            'talking': 'talking',
            'idle': 'idle'
        };
    }

    /**
     * Nettoie le texte en minuscules et sans accents pour les comparaisons regex
     */
    _normalize(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    /**
     * Parse une chaîne de caractères et extrait le texte et les émotions.
     */
    parse(input) {
        if (!input) return [];

        const steps = [];
        const regex = /\[(.*?)\]/g;
        let lastIndex = 0;
        let match;

        let currentEmotion = null;

        while ((match = regex.exec(input)) !== null) {
            const textBeforeMatch = input.substring(lastIndex, match.index).trim();
            if (textBeforeMatch) {
                const detected = currentEmotion || this._fallbackEmotion(textBeforeMatch);
                steps.push({
                    text: textBeforeMatch,
                    emotion: this._refineEmotionIfTalking(detected, textBeforeMatch)
                });
            }

            const rawTag = match[1];
            currentEmotion = this._findMatch(rawTag);
            lastIndex = regex.lastIndex;
        }

        const remainingText = input.substring(lastIndex).trim();
        if (remainingText) {
            const detected = currentEmotion || this._fallbackEmotion(remainingText);
            steps.push({
                text: remainingText,
                emotion: this._refineEmotionIfTalking(detected, remainingText)
            });
        }

        console.log("🧠 EmotionEngine : Plan d'action généré :", steps);
        return steps;
    }

    _findMatch(name) {
        if (!name) return null;
        const clean = this._normalize(name).trim();
        return this.aliasMap[clean] || clean;
    }

    /**
     * Si l'émotion est 'talking' ou 'idle', vérifie si le texte contient une description
     * d'action spécifique (entre *asterisks*) ou des mots clés pour affiner l'émotion.
     */
    _refineEmotionIfTalking(emotion, text) {
        if (emotion !== 'talking' && emotion !== 'idle') {
            return emotion;
        }

        const normalizedFull = this._normalize(text);

        // Si le texte contient une action entre asterisques, on analyse en priorite cette action
        const actionMatch = text.match(/\*(.*?)\*/);
        const targetText = actionMatch ? this._normalize(actionMatch[1]) : normalizedFull;

        // 1. TRISTESSE
        if (/pleure|triste|tristesse|regard vers le bas|baisse les yeux|decu|chagrin|soupir/.test(targetText)) {
            return 'sad';
        }

        // 2. COLÈRE
        if (/fronce|fache|colere|agacement|frustre|croise les bras|gronde|rage/.test(targetText)) {
            return 'angry';
        }

        // 3. SURPRISE
        if (/surpris|sursaute|yeux grand ouverts|incroyable/.test(targetText)) {
            return 'surprised';
        }

        // 4. TIMIDITÉ / GÊNE (inclut joues rouges, rougissement, détourner le regard)
        if (/roug|rouge|rouges|rougit|rougissement|gene|timide|embarras|detourne/.test(targetText)) {
            return 'gene';
        }

        // 5. DANSE
        if (/danse|danser|mouvement de hanches|pas de danse/.test(targetText)) {
            return 'dance';
        }

        // 6. BISOU / KISS
        if (/bisou|bise|embrasse|kiss|mwah/.test(targetText)) {
            return 'kiss';
        }

        // 7. SOURIRE / JOIE
        if (/souri|sourire|rigole|eclate de rire/.test(targetText)) {
            return 'relaxed';
        }

        // Fallback sur l'ensemble du texte si l'action n'a pas matché
        if (/pleure|triste|tristesse|decu|chagrin/.test(normalizedFull)) return 'sad';
        if (/fronce|fache|colere|agacement/.test(normalizedFull)) return 'angry';
        if (/roug|rouge|rouges|rougit|rougissement|gene|timide|embarras/.test(normalizedFull)) return 'gene';
        if (/souri|sourire|rigole/.test(normalizedFull)) return 'relaxed';

        return emotion;
    }

    /**
     * Détection de secours si le LLM n'a pas mis de crochet
     */
    _fallbackEmotion(text) {
        const normalized = this._normalize(text);

        if (/danse|danser/.test(normalized)) return 'dance';
        if (/bisou|bise|embrasse|kiss|mwah/.test(normalized)) return 'kiss'; 
        if (/bonjour|salut|hello|coucou/.test(normalized)) return 'waving';
        if (/triste|tristesse|desole|desolee|dommage|regret|chagrin/.test(normalized)) return 'sad';
        if (/enerve|colere|pas d'accord|fronce/.test(normalized)) return 'angry';
        if (/mignonne|roug|rouge|rouges|rougissement|gene|timide|merci/.test(normalized)) return 'gene';
        if (/sourire|souri|rigole/.test(normalized)) return 'relaxed';
        
        return 'talking'; 
    }
}