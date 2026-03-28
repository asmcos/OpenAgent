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
| **微信 iLink** | 扫码登录、凭证文件、`getUpdates` / `sendTextMessage` 等与 [`@tencent-weixin/openclaw-weixin`](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 协议对齐；见 `docs/WEIXIN_ILINK_RESEARCH.md` |

**微信 iLink（`import { … } from '@openagent/core'`）常用 API：**

| 符号 | 说明 |
|------|------|
| `runWeixinIlinkQrLogin` | 终端扫码，写入 `~/.openagent/weixin-ilink.json` |
| `ensureWeixinIlinkLogin` | 优先 `WEIXIN_ILINK_TOKEN` → 读文件 → TTY 下扫码 |
| `readWeixinIlinkCredentials` / `writeWeixinIlinkCredentials` | 读写凭证 JSON |
| `applyWeixinIlinkCredentialsToEnv` | 将文件中的 token/baseUrl/userId 写入 `process.env` |
| `getUpdates` / `sendTextMessage` | 长轮询收消息、发文本（需 token 与 `context_token`） |
| `defaultBaseUrl` / `defaultToken` | 默认网关与 token（读环境变量） |

兼容旧名：`runInteractiveQrLogin`、`ensureWeixinLogin`、`applyCredentialsToEnv` 等仍可从 `@openagent/core` 导出。

最小示例：`npm run example:weixin-core`（见 `examples/weixin-ilink-core.mjs`）。

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
- **微信 iLink Agent（可选）**：与 [@tencent-weixin/openclaw-weixin](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 同一套 HTTP 协议；扫码登录、入站 `getUpdates`、出站 `sendMessage`；示例中支持 **微信文本 → Agent → 自动发回微信**。

## 微信 iLink Agent（ClawBot）

在**不启动 OpenClaw Gateway** 的前提下，用本仓库脚本对接微信 **iLink Bot**（ClawBot 使用的协议）：终端扫码、长轮询收消息、LangChain Agent 推理后把回复发回微信。

### 能力概览

| 能力 | 说明 |
|------|------|
| **扫码登录** | 与插件一致：`get_bot_qrcode` → 终端展示二维码 → 轮询 `get_qrcode_status`，得到 `bot_token`；凭证默认写入 `~/.openagent/weixin-ilink.json`（可用 `OPENAGENT_STATE_DIR` 改根目录） |
| **入站** | 后台长轮询 `POST /ilink/bot/getupdates`，维护 `get_updates_buf` 游标 |
| **自动回复** | 解析入站文本 → 独立 `agentWeixin`（已去掉 `weixin_*` 工具，避免重复发送）→ `POST /ilink/bot/sendmessage` 回用户 |
| **终端 REPL** | 同一进程内仍可用本地「你:」对话，使用完整工具集（含手动 `weixin_send_text` / `weixin_get_updates`） |
| **LangChain 工具** | `src/openclawWeixinTools.js`：`weixin_send_text`、`weixin_get_updates`，供脚本或 Agent 显式调用 |

### 依赖

- 根目录已依赖 `qrcode-terminal`（终端画码）；开发依赖含 `@tencent-weixin/openclaw-weixin`（用于与官方包对齐 `channel_version` / `iLink-App-Id` 等请求头）。
- Node 建议 **≥ 22**（与 `openclaw-weixin` 包声明一致）；较低版本若可运行，以本机实测为准。

### 命令

```bash
npm run weixin-login              # 仅扫码登录并保存凭证
npm run openclaw-weixin-example   # 扫码（若需要）+ 入站轮询 + 终端对话 + 微信自动回复（默认开启）
```

### 常用参数（`openclaw-weixin-example`）

| 参数 | 含义 |
|------|------|
| `--no-weixin-login` | 不弹出扫码，只使用已有 `.env` / `weixin-ilink.json` |
| `--no-weixin-inbound` | 不启动后台 `getUpdates` |
| `--no-weixin-auto-reply` | 只打印入站日志，**不**经 Agent、**不**自动发回微信 |

### 环境变量

见 `.env.example` 中 `WEIXIN_*` / `OPENAGENT_STATE_DIR`。一般首次运行无需手写 `WEIXIN_ILINK_TOKEN`，扫码后会写入凭证文件；`WEIXIN_DEFAULT_CONTEXT_TOKEN` 在收到入站后会由示例自动更新，便于手动调试。

### 与 OpenClaw 的关系

- **相同点**：iLink HTTP 路径、扫码流程、收/发消息语义与官方微信插件一致。
- **不同点**：本示例**不**接入 OpenClaw Gateway；适合把「微信当渠道」接进自建 Agent 实验。若已在用 OpenClaw，也可继续使用其 `openclaw channels login` 管理凭证，再按需把 token 配置到本示例。

### 相关源码

| 路径 | 作用 |
|------|------|
| `src/openclaw-weixin-example.js` | 主入口：登录、入站轮询、自动回复、本地 REPL |
| `src/openclawWeixinTools.js` | LangChain 工具：`weixin_send_text`、`weixin_get_updates` |
| `packages/core/src/weixin/*` | **正式实现**：iLink HTTP、扫码登录、凭证（由 `@openagent/core` 导出） |

`npm run weixin-login` 仅调用 core 的 `runWeixinIlinkQrLogin`（见 `package.json` 脚本）。

`npm run task-example` 中已注册 `openclawWeixinTools`，可在多轮任务中配合模型使用微信工具（需自行配置 token）。

## 项目结构

```
openagent/
├── package.json
├── config.json
├── docs/
│   ├── GAPS_AND_ROADMAP.md   # 与「更智能」智能体的差距与改进路线
│   └── WEIXIN_ILINK_RESEARCH.md  # 微信 iLink 协议调研与 core 实现说明
├── examples/
│   └── weixin-ilink-core.mjs    # 仅调用 @openagent/core 微信登录/凭证
├── src/
│   ├── example.js
│   ├── task-example.js      # runTask 多轮示例（含微信 iLink 工具）
│   ├── skill-example.js     # 在应用层加载 skills/*.md 的示例
│   ├── openclaw-weixin-example.js  # 微信 iLink：扫码、入站、Agent 自动回复、REPL
│   ├── openclawWeixinTools.js        # LangChain：weixin_send_text / weixin_get_updates
│   └── skills/              # 示例 skill 文档（.md），供 skill-example 加载
│       ├── code-review.md
│       └── refactor.md
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── index.js
│   │       ├── provider.js
│   │       ├── registry.js
│   │       ├── config.js
│   │       ├── agent.js
│   │       ├── historyTrim.js   # trimHistory
│   │       ├── taskRunner.js    # runTask 多轮
│   │       └── weixin/          # 微信 iLink（扫码、HTTP、getupdates/sendmessage）
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
npm run openclaw-weixin-example   # 微信 iLink Agent（见上文「微信 iLink Agent」）
npm run weixin-login   # 仅微信扫码登录，写入 ~/.openagent/weixin-ilink.json
npm run example:weixin-core   # 最小示例：仅 @openagent/core 微信 API（见 examples/）
```

REPL 中可输入 `/tools` 查看已注册工具，`exit` 退出。

### Skill 使用（应用层自行加载）

OpenAgent **不在 core 里内置 skill**，由引用方在例子或应用中按需加载（如读 `skills/*.md` 拼进 system prompt）。  
示例：`npm run skill-example` 会从 `src/skills/` 读取所有 `.md` 并注入 system prompt，再启动交互；可输入 `/skills` 查看说明。参考 `src/skill-example.js` 与 `src/skills/*.md` 即可在自己的项目里接同样写法。

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
