/**LLM Council 配置文件。*/

import dotenv from "dotenv";
dotenv.config();

// Ollama API 密钥（Ollama 本地部署通常不需要，保留用于兼容）
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

// 理事会成员 - 本地 Ollama 模型列表
// 注意：8GB RAM 下并行加载 3 个模型，总大小建议不超过 4-5GB
export const COUNCIL_MODELS = ["deepseek-r1:1.5b", "qwen2.5:1.5b", "llama3.2:latest"];

// 主席模型 - 负责综合最终回答
export const CHAIRMAN_MODEL = "deepseek-r1:1.5b";

// Ollama API 端点（本地部署）
export const OPENROUTER_API_URL = "http://localhost:11434/api/chat";

// 数据目录，用于存储对话
export const DATA_DIR = "data/conversations";
