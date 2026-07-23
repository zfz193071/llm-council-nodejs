# LLM Council (Node.js) — 本地 Ollama 版

> 基于 Python 版 [llm-council](https://github.com/karpathy/llm-council) 移植的 Node.js 实现，后端改用 **本地 Ollama 模型**，无需 OpenRouter API Key 即可运行。

## 工作原理

1. **Stage 1: 初步意见** — 用户问题同时发送给多个本地 LLM，收集各自回答
2. **Stage 2: 匿名评审** — 每个 LLM 收到匿名化后的其他模型回答，按准确性和洞察力排名
3. **Stage 3: 主席综合** — 主席模型综合所有回答和排名，生成最终答案

核心设计：匿名评审防止模型"拉帮结派"，确保评价基于内容质量而非身份。

---

## 环境要求

- **内存: ≥8GB RAM**（推荐 16GB，8GB 下需使用小模型）
- **Node.js ≥18**
- **Ollama**（本地 LLM 运行时）

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
npm install
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

### 3. 安装 Ollama 并拉取模型

```bash
# 安装 Ollama（也可从 https://ollama.ai 下载）
brew install ollama

# 拉取推荐模型（~4GB 总大小，适合 8GB 内存）
ollama pull deepseek-r1:1.5b
ollama pull qwen2.5:1.5b
ollama pull llama3.2:latest

# 启动 Ollama 服务
ollama serve
```

### 4. 启动应用

**终端 1 — 后端（端口 8001）：**

```bash
cd backend
npm start
```

**终端 2 — 前端（端口 5173）：**

```bash
cd frontend
npm run dev
```

浏览器打开 **http://localhost:5173** 即可使用。

---

## 配置模型

编辑 `backend/src/config.js`：

```javascript
export const COUNCIL_MODELS = ["deepseek-r1:1.5b", "qwen2.5:1.5b", "llama3.2:latest"];
export const CHAIRMAN_MODEL = "deepseek-r1:1.5b";
```

> **内存参考：** 8GB 机器建议 3 个模型总大小不超过 5GB。
> 可用 `ollama list` 查看各模型大小。

### 模型选择建议

| 模型 | 大小 | 特点 |
|------|------|------|
| `deepseek-r1:1.5b` | 1.1GB | 带推理能力，适合做主席 |
| `qwen2.5:1.5b` | 986MB | 最新 Qwen 架构，通用能力强 |
| `llama3.2:latest` | 2.0GB | 3.2B 参数，综合表现好 |
| `deepseek-coder:base` | 776MB | 轻量代码模型 |
| `qwen:4b` | 2.3GB | 较旧，体积较大 |

---

## 技术栈

| 层 | 技术 |
|------|-------|
| 后端 | Express.js, axios |
| 前端 | React + Vite, react-markdown |
| 存储 | JSON 文件 (`data/conversations/`) |
| LLM | Ollama（本地部署） |
| 流式 | Server-Sent Events (SSE) |

## API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/` | 健康检查 |
| GET | `/api/conversations` | 列出所有对话 |
| POST | `/api/conversations` | 创建新对话 |
| GET | `/api/conversations/:id` | 获取对话详情 |
| POST | `/api/conversations/:id/message` | 发送消息（批量） |
| POST | `/api/conversations/:id/message/stream` | 发送消息（流式） |

---

## 与 Python 版的差异

| 维度 | Python 版 | Node.js 版 |
|------|-----------|------------|
| 框架 | FastAPI | Express.js |
| HTTP | httpx (async) | axios |
| 并发 | `asyncio.gather()` | 顺序执行（适配 8GB 内存） |
| LLM | OpenRouter（云端） | Ollama（本地） |
| 配置 | 需 API Key + 付费 | 免费，本地运行 |

---

## License

MIT
