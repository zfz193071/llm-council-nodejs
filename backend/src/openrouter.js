/**Ollama API 客户端，用于发起 LLM 请求。*/

import axios from 'axios';
import { OPENROUTER_API_URL } from './config.js';

/**
 * 通过 Ollama API 查询单个模型。
 * @param {string} model - Ollama 模型标识符（如 "deepseek-r1:7b"）
 * @param {Array} messages - 消息数组，每个消息包含 'role' 和 'content'
 * @param {number} timeout - 请求超时时间（毫秒）
 * @returns {Promise<Object|null>} 包含 'content' 和可选 'reasoning_details' 的响应对象，失败时返回 null
 */
export async function queryModel(model, messages, timeout = 120000) {
    const payload = {
        "model": model,
        "messages": messages,
        "stream": false
    };

    try {
        const response = await axios.post(
            OPENROUTER_API_URL,
            payload,
            { timeout }
        );

        const message = response.data.message;

        return {
            'content': message.content,
            'reasoning_details': message.reasoning_content || null
        };
    } catch (error) {
        console.error(`查询模型 ${model} 时出错:`, error.message);
        return null;
    }
}

/**
 * 并行查询多个模型。
 * 注意：本地 Ollama 在小内存机器上并行加载多个模型会导致严重争抢。
 * 改为顺序执行以适配 8GB 内存环境。
 * @param {Array} models - Ollama 模型标识符数组
 * @param {Array} messages - 要发送给每个模型的消息数组
 * @returns {Promise<Object>} 模型标识符到响应对象的映射（失败时为 null）
 */
export async function queryModelsParallel(models, messages) {
    const result = {};

    for (const model of models) {
        console.log(`查询模型 ${model}...`);
        const response = await queryModel(model, messages);
        result[model] = response;
    }

    return result;
}
