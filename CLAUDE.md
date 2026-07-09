# CLAUDE.md - LLM Council 技术笔记 (Node.js 版本)

本文件包含技术细节、架构决策和重要的开发实现笔记。

## 项目概述

LLM Council 是一个三阶段协商系统，多个 LLM 协作回答用户问题。其核心创新在于第二阶段的匿名同行评审，防止模型偏袒。

这是 **Node.js/Express 版本**的后端（原始版本为 Python/FastAPI）。

## 架构

### 后端结构 (`backend/`)

**`src/config.js`**
- 包含 `COUNCIL_MODELS`（模型列表）
- 包含 `CHAIRMAN_MODEL`（负责综合最终回答的模型）
- 使用环境变量 `OPENROUTER_API_KEY`（Ollama 本地部署通常不需要）
- 后端运行在 **8001 端口**（不是 8000）

**`src/openrouter.js`**
- `queryModel()`: 使用 axios 发起单个异步模型查询
- `queryModelsParallel()`: 使用 `Promise.all()` 并行查询
- 返回包含 'content' 和可选 'reasoning_details' 的对象
- 优雅降级：失败时返回 null，继续处理成功的响应

**`src/council.js`** - 核心逻辑
- `stage1CollectResponses()`: 并行查询所有理事会模型
- `stage2CollectRankings()`:
  - 将响应匿名化为 "Response A, B, C" 等
  - 创建 `labelToModel` 映射用于去匿名化
  - 提示模型进行评估和排名（严格格式要求）
  - 返回元组：[rankings_list, labelToModel_dict]
  - 每个排名包含原始文本和 `parsed_ranking` 列表
- `stage3SynthesizeFinal()`: 主席综合所有响应和排名
- `parseRankingFromText()`: 提取 "FINAL RANKING:" 部分，处理编号列表和纯文本格式
- `calculateAggregateRankings()`: 计算所有同行评估的平均排名位置
- `generateConversationTitle()`: 使用 chatglm3:6b 生成简短标题
- `runFullCouncil()`: 编排完整的三阶段流程

**`src/storage.js`**
- 基于 JSON 的对话存储，位于 `data/conversations/`
- 每个对话：`{id, created_at, title, messages[]}`
- Assistant 消息包含：`{role, stage1, stage2, stage3, timestamp}`

**`src/main.js`**
- Express 应用，CORS 启用 localhost:5173 和 localhost:3000
- POST `/api/conversations/{id}/message` 返回包含阶段的元数据
- POST `/api/conversations/{id}/message/stream` 用于 SSE 流式传输
- 元数据包括：label_to_model 映射和 aggregate_rankings

### 前端结构（与 Python 版本共享）

前端 (`frontend/`) 完全相同，可与 Python 和 Node.js 后端一起使用。

**核心组件:**
- `App.jsx` - 主编排逻辑
- `ChatInterface.jsx` - 多行文本框，Enter 发送
- `Stage1.jsx` - 单个模型响应的标签页视图
- `Stage2.jsx` - 原始评估文本 + 去匿名化显示
- `Stage3.jsx` - 最终综合回答（绿色背景）

## 关键设计决策

### 第二阶段提示格式
第二阶段提示非常具体，以确保可解析的输出：
```
1. 先单独评估每个响应
2. 提供 "FINAL RANKING:" 标题
3. 编号列表格式："1. Response C", "2. Response A" 等
4. 排名部分后无其他文本
```

这种严格格式允许可靠解析，同时仍能获得深思熟虑的评估。

### 去匿名化策略
- 模型接收："Response A", "Response B" 等
- 后端创建映射：`{"Response A": "deepseek-r1:7b", ...}`
- 前端以**粗体**显示模型名称以提高可读性
- 用户看到说明，原始评估使用匿名标签
- 这防止偏见同时保持透明度

### 错误处理哲学
- 如果某些模型失败，继续处理成功的响应（优雅降级）
- 绝不因单个模型失败而失败整个请求
- 记录错误但不暴露给用户，除非所有模型都失败

### UI/UX 透明度
- 所有原始输出可通过标签页检查
- 解析的排名显示在原始文本下方用于验证
- 用户可以验证系统对模型输出的解释
- 这建立信任并允许调试边缘情况

## 重要实现细节

### ES 模块
所有后端文件使用 ES 模块语法（`import`/`export`）。`package.json` 中设置了 `"type": "module"` 来启用此功能。

### 端口配置
- 后端：8001（从 8000 更改以避免冲突）
- 前端：5173（Vite 默认）
- 如果更改，需同时更新 `src/main.js` 和 `frontend/src/api.js`

### Markdown 渲染
所有 ReactMarkdown 组件必须用 `<div className="markdown-content">` 包装以获得正确的间距。该类在 `index.css` 中全局定义。

### 模型配置
模型硬编码在 `src/config.js` 中。主席可以与理事会成员相同或不同。当前默认值根据用户偏好使用 Gemini 作为主席。

## 常见陷阱

1. **环境变量**: 确保 `.env` 文件存在（Ollama 模式下可留空）
2. **CORS 问题**: 前端必须匹配 `main.js` CORS 中间件中的允许来源
3. **排名解析失败**: 如果模型不遵循格式，回退正则表达式提取任何 "Response X" 模式
4. **缺少元数据**: 元数据是临时的（不持久化），仅在 API 响应中可用

## 运行应用

**后端:**
```bash
cd backend
npm install
npm start
```

**前端（单独终端）:**
```bash
cd frontend
npm install
npm run dev
```

然后在浏览器中打开 http://localhost:5173

## API 端点

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/` | 健康检查 |
| GET | `/api/conversations` | 列出所有对话 |
| POST | `/api/conversations` | 创建新对话 |
| GET | `/api/conversations/:id` | 按 ID 获取对话 |
| POST | `/api/conversations/:id/message` | 发送消息（批量响应） |
| POST | `/api/conversations/:id/message/stream` | 发送消息（SSE 流式） |

## 未来增强想法

- 通过 UI 而非配置文件配置理事会/主席
- 流式响应而非批量加载
- 将对话导出为 markdown/PDF
- 随时间推移的模型性能分析
- 自定义排名标准（不仅仅是准确性/洞察力）
- 支持推理模型（o1 等）的特殊处理

## 数据流总结

```
用户查询
    ↓
第一阶段：并行查询 → [单个响应]
    ↓
第二阶段：匿名化 → 并行排名查询 → [评估 + 解析排名]
    ↓
聚合排名计算 → [按平均位置排序]
    ↓
第三阶段：主席综合所有上下文
    ↓
返回：{stage1, stage2, stage3, metadata}
    ↓
前端：标签页显示 + 验证 UI
```

整个流程在可能的地方使用异步/并行以最小化延迟。

## 迁移笔记 (Python → Node.js)

| Python | Node.js |
|--------|---------|
| `FastAPI` | `Express` |
| `httpx` (async) | `axios` |
| `asyncio.gather()` | `Promise.all()` |
| `python -m backend.main` | `node src/main.js` |
| `uv sync` | `npm install` |
| 相对导入 (`.config`) | 相对导入 (`./config.js`) |
| Pydantic 模型 | 普通 JS 对象 |

API 契约保持相同，因此前端无需更改即可工作。

## Ollama 本地部署说明

本项目已配置为使用本地 Ollama 部署：

1. **安装 Ollama**: https://ollama.ai
2. **拉取模型**:
   ```bash
   ollama pull deepseek-r1:7b
   ollama pull chatglm3:6b
   ollama pull kimi:7b
   ```
3. **启动 Ollama**: `ollama serve`（默认运行在 localhost:11434）
4. **确保模型可用**: `ollama list`
