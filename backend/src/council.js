/**3-stage LLM Council orchestration. */

import { queryModelsParallel, queryModel } from './openrouter.js';
import { COUNCIL_MODELS, CHAIRMAN_MODEL } from './config.js';

/**
 * Stage 1: Collect individual responses from all council models.
 * @param {string} userQuery - The user's question
 * @returns {Promise<Array>} List of dicts with 'model' and 'response' keys
 */
export async function stage1CollectResponses(userQuery) {
    const messages = [{ role: "user", content: userQuery }];

    // Query all models in parallel
    const responses = await queryModelsParallel(COUNCIL_MODELS, messages);

    // Format results
    const stage1Results = [];
    for (const [model, response] of Object.entries(responses)) {
        if (response !== null) {  // Only include successful responses
            stage1Results.push({
                model: model,
                response: response.content || ''
            });
        }
    }

    return stage1Results;
}

/**
 * Parse the FINAL RANKING section from the model's response.
 * @param {string} rankingText - The full text response from the model
 * @returns {Array} List of response labels in ranked order
 */
export function parseRankingFromText(rankingText) {
    // Look for "FINAL RANKING:" section
    if (rankingText.includes("FINAL RANKING:")) {
        // Extract everything after "FINAL RANKING:"
        const parts = rankingText.split("FINAL RANKING:");
        if (parts.length >= 2) {
            const rankingSection = parts[1];
            // Try to extract numbered list format (e.g., "1. Response A")
            const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
            if (numberedMatches && numberedMatches.length > 0) {
                // Extract just the "Response X" part
                return numberedMatches.map(m => m.match(/Response [A-Z]/)[0]);
            }

            // Fallback: Extract all "Response X" patterns in order
            const matches = rankingSection.match(/Response [A-Z]/g);
            if (matches) return matches;
        }
    }

    // Fallback: try to find any "Response X" patterns in order
    const matches = rankingText.match(/Response [A-Z]/g);
    return matches || [];
}

/**
 * Stage 2: Each model ranks the anonymized responses.
 * @param {string} userQuery - The original user query
 * @param {Array} stage1Results - Results from Stage 1
 * @returns {Promise<Array>} Tuple of (rankings list, label_to_model mapping)
 */
export async function stage2CollectRankings(userQuery, stage1Results) {
    // Create anonymized labels for responses (Response A, Response B, etc.)
    const labels = stage1Results.map((_, i) => String.fromCharCode(65 + i));  // A, B, C, ...

    // Create mapping from label to model name
    const labelToModel = {};
    labels.forEach((label, i) => {
        labelToModel[`Response ${label}`] = stage1Results[i].model;
    });

    // Build the ranking prompt
    const responsesText = stage1Results
        .map((result, i) => `Response ${labels[i]}:\n${result.response}`)
        .join("\n\n");

    const rankingPrompt = `You are evaluating different responses to the following question:

Question: ${userQuery}

Here are the responses from different models (anonymized):

${responsesText}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`;

    const messages = [{ role: "user", content: rankingPrompt }];

    // Get rankings from all council models in parallel
    const responses = await queryModelsParallel(COUNCIL_MODELS, messages);

    // Format results
    const stage2Results = [];
    for (const [model, response] of Object.entries(responses)) {
        if (response !== null) {
            const fullText = response.content || '';
            const parsed = parseRankingFromText(fullText);
            stage2Results.push({
                model: model,
                ranking: fullText,
                parsed_ranking: parsed
            });
        }
    }

    return [stage2Results, labelToModel];
}

/**
 * Calculate aggregate rankings across all models.
 * @param {Array} stage2Results - Rankings from each model
 * @param {Object} labelToModel - Mapping from anonymous labels to model names
 * @returns {Array} List of dicts with model name and average rank, sorted best to worst
 */
export function calculateAggregateRankings(stage2Results, labelToModel) {
    const modelPositions = {};

    for (const ranking of stage2Results) {
        const parsedRanking = ranking.parsed_ranking;

        parsedRanking.forEach((label, position) => {
            if (label in labelToModel) {
                const modelName = labelToModel[label];
                if (!modelPositions[modelName]) {
                    modelPositions[modelName] = [];
                }
                modelPositions[modelName].push(position + 1);  // 1-indexed
            }
        });
    }

    // Calculate average position for each model
    const aggregate = [];
    for (const [model, positions] of Object.entries(modelPositions)) {
        if (positions.length > 0) {
            const avgRank = positions.reduce((a, b) => a + b, 0) / positions.length;
            aggregate.push({
                model: model,
                average_rank: Math.round(avgRank * 100) / 100,
                rankings_count: positions.length
            });
        }
    }

    // Sort by average rank (lower is better)
    aggregate.sort((a, b) => a.average_rank - b.average_rank);

    return aggregate;
}

/**
 * Stage 3: Chairman synthesizes final response.
 * @param {string} userQuery - The original user query
 * @param {Array} stage1Results - Individual model responses from Stage 1
 * @param {Array} stage2Results - Rankings from Stage 2
 * @returns {Promise<Object>} Dict with 'model' and 'response' keys
 */
export async function stage3SynthesizeFinal(userQuery, stage1Results, stage2Results) {
    // Build comprehensive context for chairman
    const stage1Text = stage1Results
        .map(result => `Model: ${result.model}\nResponse: ${result.response}`)
        .join("\n\n");

    const stage2Text = stage2Results
        .map(result => `Model: ${result.model}\nRanking: ${result.ranking}`)
        .join("\n\n");

    const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: ${userQuery}

STAGE 1 - Individual Responses:
${stage1Text}

STAGE 2 - Peer Rankings:
${stage2Text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`;

    const messages = [{ role: "user", content: chairmanPrompt }];

    // Query the chairman model
    const response = await queryModel(CHAIRMAN_MODEL, messages);

    if (response === null) {
        // Fallback if chairman fails
        return {
            model: CHAIRMAN_MODEL,
            response: "Error: Unable to generate final synthesis."
        };
    }

    return {
        model: CHAIRMAN_MODEL,
        response: response.content || ''
    };
}

/**
 * Generate a short title for a conversation based on the first user message.
 * @param {string} userQuery - The first user message
 * @returns {Promise<string>} A short title (3-5 words)
 */
export async function generateConversationTitle(userQuery) {
    const titlePrompt = `Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: ${userQuery}

Title:`;

    const messages = [{ role: "user", content: titlePrompt }];

    // Use chatglm3:6b for title generation (fast and lightweight)
    const response = await queryModel("chatglm3:6b", messages, 30000);

    if (response === null) {
        return "New Conversation";
    }

    let title = (response.content || 'New Conversation').trim();

    // Clean up the title - remove quotes, limit length
    title = title.replace(/^["']|["']$/g, '');

    // Truncate if too long
    if (title.length > 50) {
        title = title.substring(0, 47) + "...";
    }

    return title;
}

/**
 * Run the complete 3-stage council process.
 * @param {string} userQuery - The user's question
 * @returns {Promise<Array>} Tuple of (stage1_results, stage2_results, stage3_result, metadata)
 */
export async function runFullCouncil(userQuery) {
    // Stage 1: Collect individual responses
    const stage1Results = await stage1CollectResponses(userQuery);

    // If no models responded successfully, return error
    if (stage1Results.length === 0) {
        return [[], [], {
            model: "error",
            response: "All models failed to respond. Please try again."
        }, {}];
    }

    // Stage 2: Collect rankings
    const [stage2Results, labelToModel] = await stage2CollectRankings(userQuery, stage1Results);

    // Calculate aggregate rankings
    const aggregateRankings = calculateAggregateRankings(stage2Results, labelToModel);

    // Stage 3: Synthesize final answer
    const stage3Result = await stage3SynthesizeFinal(userQuery, stage1Results, stage2Results);

    // Prepare metadata
    const metadata = {
        label_to_model: labelToModel,
        aggregate_rankings: aggregateRankings
    };

    return [stage1Results, stage2Results, stage3Result, metadata];
}
