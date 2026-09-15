// js/llm.js

import config from './config.js';
import { getFullSystemPrompt } from './promptManager.js';
import { mayaMCP } from './mcpClient.js';

// Nombre max d'appels d'outils enchaînés avant de forcer une réponse finale.
// Empêche la boucle infinie de function-calling (cf. bug "tourne dans le vide").
const MAX_TOOL_ITERATIONS = 6;

// Garde en mémoire process la dernière signature (tool+args) par "fil" de conversation
// pour détecter un appel identique répété consécutivement (boucle immédiate).
export async function sendMessageToLLM(text, historyMessages = [], base64Image = null, onToken = null, toolDepth = 0, lastToolSignature = null, signal = null) {
    try {
        if (toolDepth >= MAX_TOOL_ITERATIONS) {
            console.warn(`⚠️ MAX_TOOL_ITERATIONS (${MAX_TOOL_ITERATIONS}) atteint — on force une réponse finale sans outils.`);
        }
        // Lecture dynamique de la configuration serveur (data/config.json)
        // Remplace l'ancienne lecture localStorage : la config est maintenant
        // TOUJOURS la source de vérité (elle est éditée via le panneau Options).
        let currentTemp = 0.7;
        let contextSize = 16384;
        let maxMessagesSetting = 25;

        try {
            const configRes = await fetch('/api/config');
            if (configRes.ok) {
                const serverCfg = await configRes.json();

                if (serverCfg.temperature !== undefined && serverCfg.temperature !== null) {
                    currentTemp = parseFloat(serverCfg.temperature);
                }

                if (serverCfg.contextSize !== undefined && serverCfg.contextSize !== null) {
                    contextSize = parseInt(serverCfg.contextSize, 10);
                }

                if (serverCfg.maxMessages !== undefined && serverCfg.maxMessages !== null) {
                    maxMessagesSetting = parseInt(serverCfg.maxMessages, 10);
                }
            }
        } catch (e) {
            // Repli uniquement si /api/config est injoignable (ex: mode hors-ligne).
            // On garde ici config.js comme dernier filet de sécurité, plus de localStorage.
            if (config.temperature !== undefined && config.temperature !== null) {
                currentTemp = parseFloat(config.temperature);
            }
            if (config.contextSize !== undefined && config.contextSize !== null) {
                contextSize = parseInt(config.contextSize, 10);
            }
            if (config.maxMessages !== undefined && config.maxMessages !== null) {
                maxMessagesSetting = parseInt(config.maxMessages, 10);
            }
        }

        let toolsInfoText = "";
        let openAITools = [];

        if (mayaMCP && mayaMCP.isConnected && toolDepth < MAX_TOOL_ITERATIONS) {
            const tools = await mayaMCP.refreshTools();
            if (tools && tools.length > 0) {
                openAITools = tools.map(t => ({
                    type: "function",
                    function: {
                        name: t.name,
                        description: t.description || "",
                        parameters: t.inputSchema || { type: "object", properties: {} }
                    }
                }));

                // Instruction courte sans dupliquer le JSON complet des outils
                toolsInfoText = "\n\n--- OUTILS MAYA DISPONIBLES ---\n" +
                    "Si besoin d'utiliser un outil hors API native, réponds au format :\n" +
                    '```json\n{ "tool": "NOM_DE_L_OUTIL", "args": { ... } }\n```';
            }
        }

        // Nettoyage de l'historique en préservant la structure des outils
        let cleanHistory = historyMessages.map(msg => {
            let contentStr = msg.content;
            if (Array.isArray(msg.content)) {
                const textObj = msg.content.find(item => item && (item.type === 'text' || typeof item === 'string'));
                contentStr = textObj ? (typeof textObj === 'string' ? textObj : textObj.text) : '';
            }
            return {
                role: msg.role,
                content: contentStr !== undefined && contentStr !== null ? String(contentStr) : '',
                ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
                ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {})
            };
        });

        let messagesToSend = [...cleanHistory];

        if (text !== null && text !== undefined) {
            if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
                cleanHistory.pop();
            }

            const textPrompt = text || "Regarde mon écran et dis-moi ce que tu vois.";
            let userMessageObj = { role: 'user', content: textPrompt };

            if (base64Image) {
                const dataUrl = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
                const rawBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

                userMessageObj = {
                    role: 'user',
                    content: [
                        { type: 'text', text: textPrompt },
                        { type: 'image_url', image_url: { url: dataUrl } }
                    ],
                    images: [rawBase64]
                };
            }

            messagesToSend = [...cleanHistory, userMessageObj];
        }

        const estimatedMaxMsgs = Math.max(6, Math.floor(contextSize / 350));
        const finalMaxMsgs = Math.min(maxMessagesSetting, estimatedMaxMsgs);

        if (messagesToSend.length > finalMaxMsgs) {
            const systemMsgs = messagesToSend.filter(m => m.role === 'system');
            const conversationMsgs = messagesToSend.filter(m => m.role !== 'system').slice(-finalMaxMsgs);
            messagesToSend = [...systemMsgs, ...conversationMsgs];
        }

        const baseSystemPrompt = await getFullSystemPrompt();
        const forceConclusionNote = toolDepth >= MAX_TOOL_ITERATIONS
            ? '\nTu as déjà utilisé les outils disponibles plusieurs fois de suite pour cette requête. ' +
              'N\'appelle plus aucun outil : réponds maintenant à l\'utilisateur avec les informations déjà obtenues.'
            : '';
        const systemInstruction = baseSystemPrompt + toolsInfoText +
            '\n\nCONSIGNE TECHNIQUE :' +
            '\nNe génère pas de balise <think> ni de bloc de réflexion. Réponds directement, de manière naturelle et concise.' +
            forceConclusionNote;

        if (messagesToSend.length === 0 || messagesToSend[0].role !== 'system') {
            messagesToSend.unshift({ role: 'system', content: systemInstruction });
        } else {
            messagesToSend[0].content = systemInstruction;
        }

        const requestPayload = {
            model: config.model,
            messages: messagesToSend,
            temperature: currentTemp,
            top_p: 0.9,
            n_ctx: contextSize,
            stop: [
                "<|im_end|>", "<|eot_id|>", "</s>", "<|endoftext|>",
                "<think>", "</think>", "\nUtilisateur:", "\nUser:", "\nU:"
            ],
            chat_template_kwargs: { "enable_thinking": false },
            stream: true // Activation du stream SSE
        };

        if (openAITools.length > 0) {
            requestPayload.tools = openAITools;
            requestPayload.tool_choice = "auto";
        }

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        };

        if (signal) {
            fetchOptions.signal = signal;
        }

        const response = await fetch(`${config.endpoint}/chat/completions`, fetchOptions);

        if (!response.ok) {
            let errorText = "";
            try {
                const errJson = await response.json();
                errorText = errJson.error?.message || errJson.message || JSON.stringify(errJson);
            } catch (e) {
                errorText = response.statusText;
            }

            if (base64Image && (errorText.includes("mmproj") || errorText.includes("image input is not supported"))) {
                return await sendMessageToLLM(text, historyMessages, null, onToken, toolDepth, lastToolSignature, signal);
            }

            throw new Error(`Erreur HTTP ${response.status} : ${errorText}`);
        }

        // --- LECTURE ROBUSTE DU FLUX SSE ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';
        let toolCallData = null;
        let buffer = '';

        // 🔇 Détection "tool call caché dans le texte" en direct pendant le streaming,
        // pour ne JAMAIS envoyer à onToken (donc au TTS/affichage) le JSON d'un appel
        // d'outil ni ce qui pourrait suivre dans la même génération.
        //
        // - earlyBuffer / decided : tant qu'on n'a pas encore assez de caractères non-blancs
        //   pour juger, on accumule sans rien émettre. Dès qu'on peut trancher :
        //     -> ça commence par ``` ou { : on soupçonne un tool call -> silence total (suppressStreaming = true)
        //     -> sinon : réponse normale -> on balance direct l'earlyBuffer et on repasse en live
        // - Une fois "decided" en mode normal (suppressStreaming = false), on continue à surveiller
        //   CHAQUE chunk : si un ``` ou un { apparaît en cours de route (ex: le modèle commence une
        //   phrase puis part sur un tool call), on coupe immédiatement à partir de là.
        // - holdback : on garde toujours les 2 derniers caractères en réserve avant de les émettre,
        //   pour ne pas rater un ``` coupé en deux morceaux par le découpage SSE.
        let earlyBuffer = '';
        let decided = false;
        let suppressStreaming = false;
        let holdback = '';

        const FENCE_REGEX = /```|\{/;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;

                if (trimmed.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        const delta = parsed.choices?.[0]?.delta;

                        if (delta?.content) {
                            fullContent += delta.content;

                            if (typeof onToken === 'function') {
                                if (!decided) {
                                    earlyBuffer += delta.content;
                                    const trimmedStart = earlyBuffer.trimStart();

                                    if (trimmedStart.length === 0) {
                                        // Rien que du blanc pour l'instant, on attend la suite avant de juger
                                    } else if (FENCE_REGEX.test(trimmedStart.slice(0, 4)) && (trimmedStart.startsWith('```') || trimmedStart.startsWith('{'))) {
                                        // Ressemble au début d'un tool call -> silence total pour cette passe
                                        decided = true;
                                        suppressStreaming = true;
                                    } else {
                                        // Réponse normale -> on rattrape ce qu'on a accumulé, puis streaming live
                                        decided = true;
                                        suppressStreaming = false;
                                        onToken(earlyBuffer);
                                    }
                                } else if (!suppressStreaming) {
                                    // Déjà en mode "réponse normale" -> surveillance continue au fil de l'eau
                                    const combined = holdback + delta.content;
                                    const fenceIdx = combined.search(FENCE_REGEX);

                                    if (fenceIdx !== -1) {
                                        const before = combined.slice(0, fenceIdx);
                                        if (before) onToken(before);
                                        suppressStreaming = true;
                                        holdback = '';
                                    } else {
                                        // On garde les 2 derniers caractères en réserve pour ne pas
                                        // couper un ``` à cheval sur deux chunks SSE
                                        const safeLen = Math.max(0, combined.length - 2);
                                        const toEmit = combined.slice(0, safeLen);
                                        holdback = combined.slice(safeLen);
                                        if (toEmit) onToken(toEmit);
                                    }
                                }
                                // Si suppressStreaming === true à ce stade : silence total, on n'émet plus rien.
                            }
                        }

                        if (delta?.tool_calls?.[0]) {
                            if (!toolCallData) toolCallData = { id: '', name: '', argsStr: '' };
                            const tc = delta.tool_calls[0];
                            if (tc.id) toolCallData.id = tc.id;
                            if (tc.function?.name) toolCallData.name += tc.function.name;
                            if (tc.function?.arguments) toolCallData.argsStr += tc.function.arguments;
                        }
                    } catch (e) {
                        // Ignore les fragments non JSON
                    }
                }
            }
        }

        // Fin du stream : s'il reste des caractères en réserve (holdback) issus d'une
        // passe en streaming normal (jamais suspectée de tool call), on les libère.
        if (typeof onToken === 'function' && decided && !suppressStreaming && holdback) {
            onToken(holdback);
            holdback = '';
        }

        // 1. Outils natifs
        if (toolCallData && toolCallData.name && toolDepth < MAX_TOOL_ITERATIONS) {
            let toolArgs = {};
            try { toolArgs = JSON.parse(toolCallData.argsStr); } catch (e) {}

            const signature = `${toolCallData.name}:${JSON.stringify(toolArgs)}`;
            if (signature === lastToolSignature) {
                console.warn(`⚠️ Boucle détectée : appel identique répété (${signature}). Coupure immédiate.`);
                return "Je détecte que je suis en train de me répéter avec le même appel d'outil. Je m'arrête ici — peux-tu reformuler ta demande ?";
            }

            const toolResult = await mayaMCP.callTool(toolCallData.name, toolArgs);

            messagesToSend.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: toolCallData.id || 'call_1',
                    type: 'function',
                    function: { name: toolCallData.name, arguments: toolCallData.argsStr }
                }]
            });
            messagesToSend.push({
                role: 'tool',
                tool_call_id: toolCallData.id || 'call_1',
                content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
            });

            // Passe suivante : réponse finale après résultat de l'outil -> streaming normal
            return await sendMessageToLLM(null, messagesToSend, null, onToken, toolDepth + 1, signature, signal);
        }

        let cleanContent = fullContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // 2. Outils via fallback JSON Markdown
        let textToolCall = null;
        const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
        const jsonMatch = cleanContent.match(jsonBlockRegex);
        const candidateJson = jsonMatch ? jsonMatch[1].trim() : cleanContent.trim();

        try {
            if (candidateJson.startsWith('{') && candidateJson.endsWith('}')) {
                const parsed = JSON.parse(candidateJson);
                if (parsed && (parsed.tool || parsed.name)) {
                    textToolCall = {
                        name: parsed.tool || parsed.name,
                        args: parsed.args || parsed.arguments || parsed.parameters || {}
                    };
                }
            }
        } catch (e) {}

        if (textToolCall && toolDepth < MAX_TOOL_ITERATIONS) {
            const signature = `${textToolCall.name}:${JSON.stringify(textToolCall.args)}`;
            if (signature === lastToolSignature) {
                console.warn(`⚠️ Boucle détectée (fallback JSON) : appel identique répété (${signature}). Coupure immédiate.`);
                return "Je détecte que je suis en train de me répéter avec le même appel d'outil. Je m'arrête ici — peux-tu reformuler ta demande ?";
            }

            const toolResult = await mayaMCP.callTool(textToolCall.name, textToolCall.args);
            const resultString = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

            messagesToSend.push({ role: 'assistant', content: fullContent });
            messagesToSend.push({
                role: 'user',
                content: `[RÉSULTAT DE L'OUTIL ${textToolCall.name}]:\n${resultString}\n\nFormule maintenant ta réponse finale.`
            });

            // Passe suivante : réponse finale après résultat de l'outil -> streaming normal
            return await sendMessageToLLM(null, messagesToSend, null, onToken, toolDepth + 1, signature, signal);
        }

        // Pas de tool call détecté au final : si cette passe avait été bufferisée par
        // précaution (suppressStreaming) parce qu'elle ressemblait à un tool call sans
        // en être un, ou si on n'a jamais réussi à "décider" (réponse très courte),
        // on rattrape en balançant tout le contenu final d'un coup.
        if (typeof onToken === 'function' && (suppressStreaming || !decided)) {
            onToken(cleanContent);
        }

        return cleanContent;

    } catch (err) {
        console.error("❌ Erreur LLM :", err);
        throw err;
    }
}
