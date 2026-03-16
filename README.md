# OpenAgent — 库 + 应用（OpenCode 风格）

基于 Node.js 的**通用 Agent 框架**：核心库（Provider 封装、动态 Tool 注册、Agent 运行器、历史裁剪、多轮任务）+ REPL 应用。底层使用 **LangChain / LangGraph**（ChatOpenAI + ReAct Agent），Provider 由**用户**在 `config.json` 中配置（如 ollama、volcengine 等），项目不绑定任何厂商。

---

## OpenAgent 当前能力一览

### 核心库（@openagent/core）

| 能力 | 说明 |
|------|------|
| **Provider 抽象** | 无内置厂商，通过 `registerProvider` 注册后由 `createProvider(config)` 创建；支持 config + env 覆盖 |
| **Config 加载** | `config.json` / `openagent.config.json`；`getProviderConfig(providerKey)`、`getFirstProviderKey(cwd)`、`getEnvPrefix(providerKey)` |
| **动态工具注册** | `ToolRegistry`：`register` / `unregister` / `registerAll`，`getTools()` 返回 LangChain 工具数组，`listNames()` / `has()` / `size` |
| **Agent 运行器** | `createAgent({ model, getTools, systemPrompt, maxSteps })`，基于 LangGraph ReAct Agent |
| **run / chat** | `agent.run(messages)`、`agent.chat(userInput, history)`；支持可选 `options` |
| **步骤与工具回调** | `run(messages, { onStep(state), onToolStart(name, args), onToolEnd(name, result) })`，便于打印进度或埋点 |
| **流式状态** | 传入 `onStep` 时内部使用 `agent.stream()`，每步状态更新回调一次 |
| **工具重试** | `run(..., { toolRetries: N })`，工具执行失败时自动重试（默认 0） |
| **历史裁剪** | `trimHistory(messages, { maxMessages, maxApproxChars })`，控制上下文长度，避免超长或遗忘 |
| **多轮任务** | `runTask({ agent, goal, history, maxRounds, onStep, trimHistory, chatOptions })`，支持多轮「继续」执行 |

### 应用（@openagent/app）

| 能力 | 说明 |
|------|------|
| **REPL** | 交互式对话，`/tools` 查看工具列表，`exit` / `quit` 退出 |
| **Provider 注册** | volcengine、ollama 使用 `ChatOpenAI`，支持 `options.temperature`、`options.maxTokens`（来自 config） |
| **默认工具** | list_files、search_files、read_file、write_file、append_file、delete_file、grep、find |
| **自动历史裁剪** | 每轮对话前对历史做 `trimHistory(history, { maxMessages: 25, maxApproxChars: 12000 })` |
| **工具调用可见** | 每轮传入 `onToolStart` / `onToolEnd`，终端显示 `→ 工具名` / `← 工具名` |
| **工具重试** | 默认 `toolRetries: 1`，工具失败时自动重试一次 |

### 配置与扩展

| 能力 | 说明 |
|------|------|
| **config.json** | 每 provider：`name`、`options`（baseURL、apiKey、temperature、maxTokens）、`models` |
| **环境变量** | OPENAGENT_PROVIDER、OPENAGENT_API_KEY、OPENAGENT_MODEL；按 provider 的 OLLAMA_*、VOLCENGINE_* 等覆盖 |
| **多模型** | config 中 models 可配置多个，通过 env 或代码指定 modelId |

---

## 功能（简要）

- **库（@openagent/core）**：Provider 注册与创建、Config 加载、ToolRegistry、createAgent（run/chat 含 onStep、工具回调、重试）、trimHistory、runTask 多轮。
- **应用（@openagent/app）**：从 config 创建 Provider 与模型，注册默认文件/搜索类工具，REPL 中自动历史裁剪与工具调用可见、工具重试。

## 项目结构

```
openagent/
├── package.json
├── config.json
├── docs/
│   └── GAPS_AND_ROADMAP.md   # 与「更智能」智能体的差距与改进路线
├── src/
│   └── example.js
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── index.js
│   │       ├── provider.js
│   │       ├── registry.js
│   │       ├── config.js
│   │       ├── agent.js
│   │       ├── historyTrim.js   # trimHistory
│   │       └── taskRunner.js    # runTask 多轮
│   └── app/
│       └── src/
│           ├── index.js
│           ├── providers/register.js
│           └── tools/
│               ├── index.js
│               ├── files.js
│               ├── fileOps.js
│               └── search.js
```

## 快速开始

```bash
npm install
# 在项目根添加 config.json，配置至少一个 provider（见下方）
cp .env.example .env   # 按所用 provider 填写对应 API Key 等
npm start              # 运行 REPL
npm run example        # 根目录单轮对话示例
```

REPL 中可输入 `/tools` 查看已注册工具，`exit` 退出。

## Ollama（本地）使用说明

本项目支持通过 **Ollama** 作为 provider（LangChain ChatOpenAI 使用其 OpenAI 兼容接口）。

在使用 Ollama 之前，需要先安装并启动 Ollama：

- **安装**：参考 Ollama 官方安装说明（macOS / Linux / Windows）。安装完成后可在终端运行 `ollama -v` 验证。
- **启动服务**：确保本地服务在运行（通常是 `ollama serve`），并且 OpenAI 兼容接口可用（默认 `http://localhost:11434/v1`）。
- **拉取模型**：例如 `ollama pull llama3.2`（以你的 config/model 名为准）。

然后在项目根的 `config.json` 中添加 `ollama` 配置（示例）：

```json
{
  "ollama": {
    "name": "ollama",
    "options": {
      "baseURL": "http://localhost:11434/v1"
    },
    "models": {
      "llama3.2": { "name": "llama3.2" }
    }
  }
}
```

运行时可通过环境变量选择 provider / 模型：

```bash
OPENAGENT_PROVIDER=ollama npm start
# 或指定模型
OPENAGENT_PROVIDER=ollama OLLAMA_MODEL=llama3.2 npm start
```

## 配置

- **Config 文件**：项目根放置 **`config.json`**（或 `openagent.config.json`），结构为 `{ <providerKey>: { name, options, models } }`。`options` 支持：`baseURL`、`apiKey`、`temperature`（默认 0.7）、`maxTokens`。环境变量会覆盖同名字段。
- **环境变量**：
  - `OPENAGENT_PROVIDER`：当前使用的 provider key（不设则取 config 中第一个）
  - `OPENAGENT_API_KEY` / `OPENAGENT_MODEL`：通用 API Key / 模型
  - 按 provider 约定：如 `OLLAMA_API_KEY`、`OLLAMA_MODEL`、`VOLCENGINE_API_KEY` 等覆盖

## 作为库使用

需先注册 provider，再根据 config 创建模型：

```js
import { ChatOpenAI } from '@langchain/openai';
import { registerProvider, createProvider, getProviderConfig, getFirstProviderKey, getEnvPrefix, ToolRegistry, createAgent } from '@openagent/core';

registerProvider('openai', (options) => ({
  chatModel(modelId) {
    return new ChatOpenAI({ openAIApiKey: options.apiKey, configuration: { baseURL: options.baseURL }, model: modelId });
  },
}));

const providerKey = process.env.OPENAGENT_PROVIDER || getFirstProviderKey(process.cwd());
const cfg = providerKey ? getProviderConfig(providerKey, process.cwd()) : null;
if (cfg) {
  const prefix = getEnvPrefix(providerKey);
  if (prefix && process.env[`${prefix}_API_KEY`]) cfg.providerConfig.options.apiKey = process.env[`${prefix}_API_KEY`];
  const provider = createProvider(cfg.providerConfig);
  const model = provider.chatModel(cfg.modelId || process.env.OPENAGENT_MODEL);
  const registry = new ToolRegistry();
  registry.register('my_tool', myTool);  // LangChain DynamicStructuredTool
  const agent = createAgent({ model, getTools: () => registry.getTools(), systemPrompt: '...' });
  const { text } = await agent.chat('...');
  // 可选：步骤回调、工具回调、重试
  const { text: text2 } = await agent.chat('...', history, {
    onStep: (state) => {},
    onToolStart: (name, args) => console.log('→', name),
    onToolEnd: (name, result) => console.log('←', name),
    toolRetries: 1,
  });
  // 历史裁剪
  const { trimHistory } = await import('@openagent/core');
  const trimmed = trimHistory(history, { maxMessages: 25, maxApproxChars: 12000 });
  // 多轮任务
  const { runTask } = await import('@openagent/core');
  const { steps, history: newHistory, final } = await runTask({
    agent, goal: '...', history: [], maxRounds: 3, onStep: (s) => console.log(s),
  });
}
```

## 扩展 Provider

```js
import { ChatOpenAI } from '@langchain/openai';
import { createProvider, registerProvider } from '@openagent/core';

registerProvider('my-api', (options) => ({
  chatModel(modelId) {
    return new ChatOpenAI({ openAIApiKey: options.apiKey, configuration: { baseURL: options.baseURL }, model: modelId });
  },
}));
const provider = createProvider({ name: 'my-api', options: { baseURL, apiKey } });
```

## 技术栈

Node.js (ESM)、LangChain / LangGraph（`@langchain/core`、`@langchain/langgraph`、`@langchain/openai`）、`zod`

## 说明

- 应用依赖 core 使用 `file:../core`；若使用 pnpm/yarn 可改为 `workspace:*`。
- 从仓库根执行 `npm start` 运行 `@openagent/app` 的 REPL。
