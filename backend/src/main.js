/**Express backend for LLM Council. */

import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as storage from './storage.js';
import { runFullCouncil, generateConversationTitle, stage1CollectResponses, stage2CollectRankings, stage3SynthesizeFinal, calculateAggregateRankings } from './council.js';

const app = express();
const PORT = 8001;

// Middleware
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true
}));
app.use(express.json());

/**Health check endpoint. */
app.get("/", (req, res) => {
    res.json({ status: "ok", service: "LLM Council API" });
});

/**List all conversations (metadata only). */
app.get("/api/conversations", (req, res) => {
    const conversations = storage.listConversations();
    res.json(conversations);
});

/**Create a new conversation. */
app.post("/api/conversations", (req, res) => {
    const conversationId = uuidv4();
    const conversation = storage.createConversation(conversationId);
    res.json(conversation);
});

/**Get a specific conversation with all its messages. */
app.get("/api/conversations/:conversationId", (req, res) => {
    const conversation = storage.getConversation(req.params.conversationId);
    if (conversation === null) {
        res.status(404).json({ detail: "Conversation not found" });
        return;
    }
    res.json(conversation);
});

/**Send a message and run the 3-stage council process. */
app.post("/api/conversations/:conversationId/message", async (req, res) => {
    const { content } = req.body;
    const conversationId = req.params.conversationId;

    // Check if conversation exists
    const conversation = storage.getConversation(conversationId);
    if (conversation === null) {
        res.status(404).json({ detail: "Conversation not found" });
        return;
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Add user message
    storage.addUserMessage(conversationId, content);

    // If this is the first message, generate a title
    if (isFirstMessage) {
        const title = await generateConversationTitle(content);
        storage.updateConversationTitle(conversationId, title);
    }

    // Run the 3-stage council process
    const [stage1Results, stage2Results, stage3Result, metadata] = await runFullCouncil(content);

    // Add assistant message with all stages
    storage.addAssistantMessage(conversationId, stage1Results, stage2Results, stage3Result);

    // Return the complete response with metadata
    res.json({
        stage1: stage1Results,
        stage2: stage2Results,
        stage3: stage3Result,
        metadata: metadata
    });
});

/**Send a message and stream the 3-stage council process. */
app.post("/api/conversations/:conversationId/message/stream", async (req, res) => {
    const { content } = req.body;
    const conversationId = req.params.conversationId;

    // Check if conversation exists
    const conversation = storage.getConversation(conversationId);
    if (conversation === null) {
        res.status(404).json({ detail: "Conversation not found" });
        return;
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        // Add user message
        storage.addUserMessage(conversationId, content);

        // Start title generation in parallel
        let titlePromise = null;
        if (isFirstMessage) {
            titlePromise = generateConversationTitle(content);
        }

        // Stage 1: Collect responses
        res.write(`data: ${JSON.stringify({ type: 'stage1_start' })}\n\n`);
        const stage1Results = await stage1CollectResponses(content);
        res.write(`data: ${JSON.stringify({ type: 'stage1_complete', data: stage1Results })}\n\n`);

        // Stage 2: Collect rankings
        res.write(`data: ${JSON.stringify({ type: 'stage2_start' })}\n\n`);
        const [stage2Results, labelToModel] = await stage2CollectRankings(content, stage1Results);
        const aggregateRankings = calculateAggregateRankings(stage2Results, labelToModel);
        res.write(`data: ${JSON.stringify({ 
            type: 'stage2_complete', 
            data: stage2Results, 
            metadata: { label_to_model: labelToModel, aggregate_rankings: aggregateRankings }
        })}\n\n`);

        // Stage 3: Synthesize final answer
        res.write(`data: ${JSON.stringify({ type: 'stage3_start' })}\n\n`);
        const stage3Result = await stage3SynthesizeFinal(content, stage1Results, stage2Results);
        res.write(`data: ${JSON.stringify({ type: 'stage3_complete', data: stage3Result })}\n\n`);

        // Wait for title generation if it was started
        if (titlePromise) {
            const title = await titlePromise;
            storage.updateConversationTitle(conversationId, title);
            res.write(`data: ${JSON.stringify({ type: 'title_complete', data: { title } })}\n\n`);
        }

        // Save complete assistant message
        storage.addAssistantMessage(conversationId, stage1Results, stage2Results, stage3Result);

        // Send completion event
        res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);

    } catch (error) {
        // Send error event
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    }

    res.end();
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`LLM Council API server running on http://0.0.0.0:${PORT}`);
});

export default app;
