# LLM Council (Node.js)

---

## English

The idea of this repo is that instead of asking a question to your favorite LLM provider (e.g. OpenAI GPT, Google Gemini, Anthropic Claude, xAI Grok), you can group them into your "LLM Council". This repo is a simple, local web app that essentially looks like ChatGPT except it sends your query to multiple LLMs, asks them to review and rank each other's work, and finally a Chairman LLM produces the final response.

### How It Works

1. **Stage 1: First opinions**. The user query is given to all LLMs individually, and the responses are collected. The individual responses are shown in a "tab view", so that the user can inspect them all one by one.
2. **Stage 2: Review**. Each individual LLM is given the responses of the other LLMs. Under the hood, the LLM identities are anonymized so that the LLM can't play favorites when judging their outputs. The LLM is asked to rank them in accuracy and insight.
3. **Stage 3: Final response**. The designated Chairman of the LLM Council takes all of the model's responses and compiles them into a single final answer that is presented to the user.

### Vibe Code Alert

This project was 99% vibe coded as a fun Saturday hack. It's nice and useful to see multiple responses side by side, and also the cross-opinions of all LLMs on each other's outputs. I'm not going to support it in any way, it's provided here as is for other people's inspiration and I don't intend to improve it. Code is ephemeral now and libraries are over, ask your LLM to change it in whatever way you like.

---

## 中文

这个项目的想法是，与其向你最喜爱的 LLM 提供商（如 OpenAI GPT、Google Gemini、Anthropic Claude、xAI Grok）提问，不如将它们组合成你的"LLM 理事会"。这是一个简单的本地 Web 应用，界面类似 ChatGPT，但它会将你的查询发送给多个 LLM，让它们互相评审和排名对方的工作，最后由一个主席 LLM 生成最终回答。

### 工作原理

1. **第一阶段：初步意见**。用户查询单独发送给所有 LLM，收集响应。单个响应以"标签页视图"显示，用户可以逐一检查。
2. **第二阶段：评审**。每个 LLM 都会收到其他 LLM 的响应。在底层，LLM 的身份被匿名化，这样 LLM 在判断输出时不会偏袒。LLM 被要求按准确性和洞察力对它们进行排名。
3. **第三阶段：最终回答**。指定的 LLM 理事会主席综合所有模型的响应，编译成一个最终答案呈现给用户。

### 说明

这个项目 99% 是通过"vibe coding"（随性编码）完成的，作为一个有趣的周末黑客项目。并排查看多个响应以及所有 LLM 对彼此输出的交叉意见，既有趣又实用。我不会以任何方式支持它，这里提供它是为了给其他人启发，我并不打算改进它。代码是短暂的，库是过时的，让你的 LLM 以任何你喜欢的方式修改它。

---

## Setup | 设置

### 1. Install Dependencies | 安装依赖

**Backend (Node.js) | 后端:**

```bash
cd backend
npm install
```

**Frontend | 前端:**

```bash
cd frontend
npm install
cd ..
```

### 2. Install Ollama & Pull Models | 安装 Ollama 并拉取模型

**Install Ollama | 安装 Ollama:**
Download from https://ollama.ai

**Pull the models | 拉取模型:**

```bash
ollama pull deepseek-r1:7b
ollama pull chatglm3:6b
ollama pull kimi:7b
```

**Start Ollama | 启动 Ollama:**

```bash
ollama serve
```

Ollama will run on `localhost:11434` by default. | Ollama 默认运行在 `localhost:11434`。

### 3. Configure Models (Optional) | 配置模型（可选）

Edit `backend/src/config.js` to customize the council | 编辑 `backend/src/config.js` 自定义理事会:

```javascript
export const COUNCIL_MODELS = ["deepseek-r1:7b", "chatglm3:6b", "kimi:7b"];

export const CHAIRMAN_MODEL = "deepseek-r1:7b";
```

---

## Running the Application | 运行应用

**Terminal 1 | 终端 1 (Backend | 后端):**

```bash
cd backend
npm start
```

**Terminal 2 | 终端 2 (Frontend | 前端):**

```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser. | 然后在浏览器中打开 http://localhost:5173

---

## Tech Stack | 技术栈

- **Backend | 后端:** Express.js (Node.js), axios for HTTP requests | Express.js (Node.js), axios 用于 HTTP 请求
- **Frontend | 前端:** React + Vite, react-markdown for rendering | React + Vite, react-markdown 用于渲染
- **Storage | 存储:** JSON files in `data/conversations/` | `data/conversations/` 中的 JSON 文件
- **LLM Runtime | LLM 运行时:** Ollama (local deployment) | Ollama（本地部署）
- **Package Management | 包管理:** npm for both backend and frontend | 后端和前端都使用 npm

---

## Differences from Python Version | 与 Python 版本的区别

| Feature         | Python Version           | Node.js Version    |
| --------------- | ------------------------ | ------------------ |
| Framework       | FastAPI                  | Express.js         |
| HTTP Client     | httpx (async)            | axios              |
| Concurrency     | asyncio.gather()         | Promise.all()      |
| Entry Point     | `python -m backend.main` | `node src/main.js` |
| Package Manager | uv                       | npm                |

The API contract is identical, so the frontend works with either backend. | API 契约相同，因此前端可与任一后端一起使用。

---

## API Endpoints | API 端点

- `GET /` - Health check | 健康检查
- `GET /api/conversations` - List all conversations | 列出所有对话
- `POST /api/conversations` - Create new conversation | 创建新对话
- `GET /api/conversations/:id` - Get conversation by ID | 按 ID 获取对话
- `POST /api/conversations/:id/message` - Send message (batch response) | 发送消息（批量响应）
- `POST /api/conversations/:id/message/stream` - Send message (SSE streaming) | 发送消息（SSE 流式）

---

## License | 许可证

MIT License - Feel free to use and modify as you like.

MIT 许可证 - 随意使用和修改。
