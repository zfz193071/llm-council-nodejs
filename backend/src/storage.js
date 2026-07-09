/**JSON-based conversation storage. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATA_DIR } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve data directory relative to project root
const dataDir = path.join(__dirname, '../../../', DATA_DIR);

/**Ensure data directory exists. */
function ensureDataDir() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

/**Get the path to a conversation file.
 * @param {string} conversationId - The conversation ID
 * @returns {string} Path to the conversation JSON file
 */
function getConversationPath(conversationId) {
    ensureDataDir();
    return path.join(dataDir, `${conversationId}.json`);
}

/**
 * List all conversations (metadata only).
 * @returns {Array} List of conversation metadata objects
 */
export function listConversations() {
    ensureDataDir();

    try {
        const files = fs.readdirSync(dataDir);
        const conversations = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const conversationId = file.slice(0, -5);
                const conversation = getConversation(conversationId);
                if (conversation) {
                    conversations.push({
                        id: conversation.id,
                        created_at: conversation.created_at,
                        title: conversation.title,
                        message_count: conversation.messages.length
                    });
                }
            }
        }

        // Sort by created_at descending (newest first)
        conversations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return conversations;
    } catch (error) {
        console.error('Error listing conversations:', error);
        return [];
    }
}

/**
 * Create a new conversation.
 * @param {string} conversationId - The conversation ID
 * @returns {Object} The created conversation
 */
export function createConversation(conversationId) {
    ensureDataDir();

    const conversation = {
        id: conversationId,
        created_at: new Date().toISOString(),
        title: "New Conversation",
        messages: []
    };

    const filePath = getConversationPath(conversationId);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));

    return conversation;
}

/**
 * Get a specific conversation with all its messages.
 * @param {string} conversationId - The conversation ID
 * @returns {Object|null} The conversation or null if not found
 */
export function getConversation(conversationId) {
    try {
        const filePath = getConversationPath(conversationId);
        if (!fs.existsSync(filePath)) {
            return null;
        }

        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading conversation ${conversationId}:`, error);
        return null;
    }
}

/**
 * Update conversation title.
 * @param {string} conversationId - The conversation ID
 * @param {string} title - The new title
 */
export function updateConversationTitle(conversationId, title) {
    const conversation = getConversation(conversationId);
    if (conversation) {
        conversation.title = title;
        const filePath = getConversationPath(conversationId);
        fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));
    }
}

/**
 * Add a user message to a conversation.
 * @param {string} conversationId - The conversation ID
 * @param {string} content - The message content
 */
export function addUserMessage(conversationId, content) {
    const conversation = getConversation(conversationId);
    if (conversation) {
        conversation.messages.push({
            role: "user",
            content: content,
            timestamp: new Date().toISOString()
        });

        const filePath = getConversationPath(conversationId);
        fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));
    }
}

/**
 * Add an assistant message with all stages to a conversation.
 * @param {string} conversationId - The conversation ID
 * @param {Array} stage1 - Stage 1 results
 * @param {Array} stage2 - Stage 2 results
 * @param {Object} stage3 - Stage 3 result
 */
export function addAssistantMessage(conversationId, stage1, stage2, stage3) {
    const conversation = getConversation(conversationId);
    if (conversation) {
        conversation.messages.push({
            role: "assistant",
            stage1: stage1,
            stage2: stage2,
            stage3: stage3,
            timestamp: new Date().toISOString()
        });

        const filePath = getConversationPath(conversationId);
        fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));
    }
}
