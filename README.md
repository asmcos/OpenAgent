# OpenAgent — 库 + 应用（OpenCode 风格）

基于 Node.js 的**通用 Agent 框架**：核心库（Provider 封装、动态 Tool 注册、Agent 运行器）+ REPL 应用。Provider 由**用户**在 `config.json` 中配置（如 ollama、或其它 key），项目不绑定任何厂商。

## 功能

- **库（@openagent/core）**
  - **Provider**：默认无内置 provider，需通过 `registerProvider` 注册后才可用 `createProvider`
  - **动态 Tool 注册**：`ToolRegistry` 支持运行时 `register` / `unregister`，Agent 通过 `getTools()` 使用当前工具集
  - **Config 加载**：仅读取 `config.json`（及可选 `openagent.config.json`），`getProviderConfig(providerKey)` 读任意 provider，env 可覆盖
  - **Agent**：绑定 model + getTools + systemPrompt，提供 `run(messages)` / `chat(userInput, history)`
- **应用（@openagent/app）**
  - 在 `providers/register.js` 中注册 provider（如 volcengine、ollama），再从 `config.json` 和 `OPENAGENT_PROVIDER` 创建模型，运行 REPL

## 项目结构

```
openagent/
├── package.json
├── config.json               # 用户配置的 provider（如 ollama 或其它 key）
├── .env.example
├── src/
│   └── example.js            # 使用 core 的示例
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── index.js
│   │       ├── provider.js   # createProvider / registerProvider
│   │       ├── registry.js
│   │       ├── config.js     # 仅读 config.json；getProviderConfig / getFirstProviderKey / getEnvPrefix
│   │       └── agent.js
│   └── app/
│       └── src/
│           ├── index.js
│           ├── providers/register.js   # 注册 provider（volcengine、ollama 等）
│           └── tools/files.js
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

## 配置

- **Config 文件**：项目根放置 **`config.json`**（或 `openagent.config.json`），结构为 `{ <providerKey>: { name, options, models } }` 或 `{ providers: { <providerKey>: ... } }`。provider key 由用户自定（如 `ollama`、或其它名称）。环境变量会覆盖同名字段。
- **环境变量**：
  - `OPENAGENT_PROVIDER`：当前使用的 provider key（不设则取 config 中第一个）
  - `OPENAGENT_API_KEY` / `OPENAGENT_MODEL`：通用 API Key / 模型
  - 按 provider 约定：若 config 中某 key 有对应前缀（如 `ollama` → `OLLAMA_*`），则可用 `OLLAMA_API_KEY`、`OLLAMA_MODEL` 等覆盖

## 作为库使用

需先注册 provider，再根据 config 创建模型：

```js
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { registerProvider, createProvider, getProviderConfig, getFirstProviderKey, getEnvPrefix, ToolRegistry, createAgent } from '@openagent/core';

registerProvider('openai', (options) => createOpenAICompatible({ name: 'openai', ...options }));

const providerKey = process.env.OPENAGENT_PROVIDER || getFirstProviderKey(process.cwd());
const cfg = providerKey ? getProviderConfig(providerKey, process.cwd()) : null;
if (cfg) {
  const prefix = getEnvPrefix(providerKey);
  if (prefix && process.env[`${prefix}_API_KEY`]) cfg.providerConfig.options.apiKey = process.env[`${prefix}_API_KEY`];
  const provider = createProvider(cfg.providerConfig);
  const model = provider.chatModel(cfg.modelId || process.env.OPENAGENT_MODEL);
  const registry = new ToolRegistry();
  registry.register('my_tool', myTool);
  const agent = createAgent({ model, getTools: () => registry.getTools(), systemPrompt: '...' });
  const { text } = await agent.chat('...');
}
```

## 扩展 Provider

```js
import { createProvider, registerProvider } from '@openagent/core';

registerProvider('my-api', (options) => {
  return createOpenAICompatible({ name: 'my-api', ...options });
});
const provider = createProvider({ name: 'my-api', options: { baseURL, apiKey } });
```

## 技术栈

Node.js (ESM)、Vercel AI SDK (`ai`)、`@ai-sdk/openai-compatible`、`zod`

## 说明

- 应用依赖 core 使用 `file:../core`；若使用 pnpm/yarn 可改为 `workspace:*`。
- 从仓库根执行 `npm start` 运行 `@openagent/app` 的 REPL。
