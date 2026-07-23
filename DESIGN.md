# LLM Council 移植：从 Python 到 Node.js 的踩坑与优化实录

## 一、项目概述

LLM Council 是一个 **多 LLM 协作审议系统**，核心流程分三阶段：

1. **Stage 1** — 多个 LLM 独立回答同一问题
2. **Stage 2** — 匿名状态下互相评审排名（核心创新点）
3. **Stage 3** — 主席模型综合所有意见给出最终答案

本仓库是 Python 原版（[llm-council](https://github.com/karpathy/llm-council)）的 **Node.js 移植 + 本地 Ollama 适配版**，仓库地址：[https://github.com/zfz193071/llm-council-nodejs](https://github.com/zfz193071/llm-council-nodejs)。

### 核心价值

| 设计                                   | 解决的问题                                    |
| -------------------------------------- | --------------------------------------------- |
| 匿名互评                               | LLM 评审同类时存在"同侪偏袒"（in-group bias） |
| 并行 + 优雅降级                        | 某模型超时/失败不影响整体流程                 |
| 严格 ranking 格式 + 多级 fallback 解析 | LLM 非结构化输出的可靠性保障                  |
| 客户端去匿名化                         | 评审阶段匿名，展示阶段透明                    |

---

## 二、架构设计

### 2.1 整体数据流

```
用户查询
    ↓
Stage 1: 顺序查询 3 个本地模型 → [individual responses]
    ↓
Stage 2: 匿名化 → 顺序查询 3 个模型 → [evaluations + parsed_ranking]
    ↓
聚合排名计算 → [按平均位置排序]
    ↓
Stage 3: 主席模型综合全部上下文
    ↓
返回: {stage1, stage2, stage3, metadata}
```

### 2.2 代码结构

```
backend/src/
├── config.js         # 模型配置、API 端点
├── openrouter.js     # Ollama API 客户端
├── council.js        # 三阶段核心编排
├── storage.js        # JSON 文件存储
└── main.js           # Express 路由 + SSE 流式
```

### 2.3 匿名互评机制（核心设计）

```javascript
// 创建匿名标签：Response A, Response B, Response C
const labels = stage1Results.map((_, i) => String.fromCharCode(65 + i));

// 保留映射关系用于客户端去匿名化
labelToModel[`Response ${label}`] = stage1Results[i].model;

// 评审 prompt 中完全不暴露模型身份
const rankingPrompt = `...Please rank the following:
Response A: ...
Response B: ...
Response C: ...`;
```

评审阶段模型看到的是匿名标签，去匿名化在 **前端渲染时** 完成（`Stage2.jsx` 的 `deAnonymizeText` 函数）。

### 2.4 排名解析的可靠性设计

```javascript
function parseRankingFromText(rankingText) {
  // Level 1: 找到 "FINAL RANKING:" 标记区域
  //   → Level 2: 在区域内提取 "1. Response A" 编号列表
  //     → Level 3: 纯正则提取所有 "Response X" 模式
  // 最终 fallback: 全文范围提取所有 "Response X"
}
```

三段式 fallback 确保即使模型输出格式偏离，也能正确解析。

---

## 三、问题记录与解决思路

### 问题 2: 冷启动超时（标题生成）

**现象：** `generateConversationTitle` 使用 30 秒超时，但本地模型首次请求需要从磁盘加载到内存。

**测试数据：** qwen:4b 的 `load_duration` 为 14.9 秒，总耗时 16.5 秒。对于更大的模型（如 llama2:latest 3.8GB），冷启动可能超过 30 秒。

**解决：** 将标题生成的超时从 30s 提升至 120s，与 council 模型查询的超时一致。

```javascript
// 改前
const response = await queryModel(CHAIRMAN_MODEL, messages, 30000);

// 改后
const response = await queryModel(CHAIRMAN_MODEL, messages, 120000);
```

**经验：** 本地 LLM 的冷启动时间和云端 API 完全不同。云端 30s 很充裕，本地模型首次加载可能需 30s+。超时配置应考虑运行环境差异。

---

### 问题 3: 并行模型查询导致内存超限

**现象：** Stage 1 和 Stage 2 中 3 个模型并行查询，全部超时（120s）。第二阶段因显式日志确认是 Stage 3 运行时发现所有 council 模型均超时。

**错误日志：**

```
查询模型 deepseek-r1:1.5b 时出错: timeout of 120000ms exceeded
查询模型 qwen2.5:1.5b 时出错: timeout of 120000ms exceeded
查询模型 llama3.2:latest 时出错: timeout of 120000ms exceeded
```

第一轮查询正常，第二轮及后续全部超时。

**根因分析：**

并行测试结果揭示了根本原因：

| 模型               | 大小   | 并行耗时 | 顺序耗时（单独跑） |
| ------------------ | ------ | -------- | ------------------ |
| `deepseek-r1:1.5b` | 1.1 GB | 60.0s    | ~3s                |
| `qwen2.5:1.5b`     | 986 MB | 52.2s    | ~8s                |
| `llama3.2:latest`  | 2.0 GB | 62.1s    | ~8s                |

机器配置：**8GB RAM**，无独立 GPU。

并行时 3 个模型同时加载并运行推理，内存争抢导致系统大量 swap，推理时间膨胀 20 倍。第一轮勉强通过（冷启动 + 缓存未满），第二轮因内存页交换加剧导致全面超时。

**解决：** 将并行查询改为顺序执行。

```javascript
// 改前：Promise.all 并行
async function queryModelsParallel(models, messages) {
  const tasks = models.map((model) => queryModel(model, messages));
  return await Promise.all(tasks);
}

// 改后：for 循环顺序执行
async function queryModelsParallel(models, messages) {
  const result = {};
  for (const model of models) {
    const response = await queryModel(model, messages);
    result[model] = response;
  }
  return result;
}
```

**效果对比：**

| 方式         | Stage 1 耗时 | Stage 2 耗时 | 总耗时 |     成功率      |
| ------------ | :----------: | :----------: | :----: | :-------------: |
| 并行（改前） |     ~62s     |     ~62s     | ~180s+ | ❌ 第二轮起超时 |
| 顺序（改后） |     ~20s     |     ~20s     |  ~60s  |     ✅ 稳定     |

**经验沉淀：**

1. **Ollama 与云端 API 的并发假设不同。** 云端 API 并行查询显著减少延迟，但本地 Ollama 受限于单机内存带宽，并行反而降低吞吐。
2. **8GB 是本地 LLM 部署的"低保"线。** 低于此内存需严格控制并发和模型总大小（建议 ≤4-5GB）。
3. **负载测试应覆盖多轮场景。** 第一轮正常不代表系统稳定——缓存、swap 状态在后续请求中会恶化。

---

### 问题 4: 模型选择与内存匹配

**现象：** 初始配置使用了 `deepseek-r1:7b`、`qwen:4b`、`llama2:latest`，合计 7.2GB。在 8GB 机器上即使顺序执行也压力很大。

**解决：** 更换为更小的模型组合。

| 角色     | 改前（7.2GB）            | 改后（~4.1GB）             |
| -------- | ------------------------ | -------------------------- |
| Council  | `deepseek-r1:7b` (4.7GB) | `deepseek-r1:1.5b` (1.1GB) |
| Council  | `qwen:4b` (2.3GB)        | `qwen2.5:1.5b` (986MB)     |
| Council  | `llama2:latest` (3.8GB)  | `llama3.2:latest` (2.0GB)  |
| Chairman | `deepseek-r1:7b`         | `deepseek-r1:1.5b`         |

注意：模型大小是磁盘占用，运行时内存占用约为模型参数的 2-4 倍（含 KV cache），需预留余量。

---

## 四、关键设计决策

### 4.1 为什么不保留 Python 版的 OpenRouter？

选择 Ollama 而非 OpenRouter 的考虑：

- **零成本**：无需 API Key 和付费
- **离线可用**：不依赖网络
- **数据隐私**：查询不离开本地

代价：模型能力弱于云端模型，且受本地硬件限制。

### 4.2 前端为何与 Python 版共享？

API 契约完全兼容（`stage1`/`stage2`/`stage3` 响应格式一致），无需修改前端即可在两个后端间切换。这也是本项目的设计目标之一。

### 4.3 为什么保留了 `queryModelsParallel` 的函数名？

虽然实现已改为顺序执行，但保留了函数名和签名以维持 API 兼容性。如果将来迁移到更强大的硬件，只需修改函数体即可恢复真正的并行。

### 4.4 流式 SSE 支持说明

后端已实现 SSE 流式端点（`/message/stream`），每个阶段完成时推送事件。前端可逐步展示 Stage 1 → Stage 2 → Stage 3 的进度，无需等待全部完成。

---

## 五、运行建议

### 内存不足时的优化策略

1. **减少模型数量**: 将 `COUNCIL_MODELS` 从 3 个减为 2 个
2. **使用更小的模型**: `deepseek-coder:base` (776MB) + `deepseek-r1:1.5b` (1.1GB) = <2GB
3. **保留顺序执行**: 不要改回 `Promise.all` 并行
4. **Ollama 配置**: 设置 `OLLAMA_NUM_PARALLEL=1`（默认行为已如此）

### 推荐硬件配置

| 配置      | 可运行模型数 | 推荐模型大小 |
| --------- | ------------ | ------------ |
| 8GB RAM   | 2-3 个小模型 | ≤1.5B 参数   |
| 16GB RAM  | 3 个小模型   | ≤7B 参数     |
| 32GB RAM+ | 3 个中等模型 | ≤13B 参数    |

---

## 六、附录：关键文件清单

| 文件                                 | 职责                                 |
| ------------------------------------ | ------------------------------------ |
| `backend/src/config.js`              | 模型列表、API 端点配置               |
| `backend/src/openrouter.js`          | Ollama HTTP 客户端，顺序查询         |
| `backend/src/council.js`             | 三阶段编排 + ranking 解析 + 聚合计算 |
| `backend/src/main.js`                | Express 路由 + SSE 流式端点          |
| `backend/src/storage.js`             | JSON 持久化                          |
| `frontend/src/components/Stage2.jsx` | 匿名评审展示 + 客户端去匿名化        |
