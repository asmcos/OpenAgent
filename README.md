# OpenAgent - 一个简单 Agent 例子

基于 Node.js 实现一个支持**对话**和**查文件**的简单 Agent。

目前配置的是火山大模型的例子

## 功能

- **多轮对话**：与模型自然对话
- **查文件任务**：
  - `list_files`：列出指定目录下的文件和子目录
  - `search_files`：在目录下按文件名关键词搜索

## 配置说明（OpenCode 风格）

项目中的 `volcengine.config.json` 为火山引擎的 OpenCode 配置示例：

```json
{
  "volcengine": {
    "name": "volcengine",
    "npm": "@ai-sdk/openai-compatible",
    "options": {
      "baseURL": "https://ark.cn-beijing.volces.com/api/v3",
      "apiKey": ""
    },
    "models": {
      "doubao-seed-2.0-lite": { "name": "doubao-seed-2.0-lite" },
      "doubao-seed-2.0-pro": { "name": "doubao-seed-2.0-pro" },
      "doubao-seed-2.0-code": { "name": "doubao-seed-2.0-code" }
    }
  }
}
```

- **对话接口**：`baseURL` 使用 `https://ark.cn-beijing.volces.com/api/v3`
- **代码/编程接口**：可改为 `https://ark.cn-beijing.volces.com/api/coding/v3`
- **模型名**：需与火山方舟控制台中创建的推理接入点 ID 一致（有时是完整 endpoint ID）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制示例并填入 API Key：

```bash
cp .env.example .env
# 编辑 .env，设置 VOLCENGINE_API_KEY
```

`.env` 示例：

```
VOLCENGINE_API_KEY=你的API密钥
VOLCENGINE_MODEL=doubao-seed-2.0-lite
VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

API Key 与推理接入点请在 [火山方舟控制台](https://console.volcengine.com/ark) 创建并获取。

### 3. 运行

```bash
npm start
```

在 REPL 中可输入：

- 普通对话：例如「你好」「介绍一下自己」
- 查文件：例如「列出当前目录的文件」「在 src 目录下找包含 index 的文件」

输入 `exit` 或 `quit` 退出。

## 项目结构

```
openagent/
├── package.json
├── volcengine.config.json   # 火山引擎 OpenCode 配置示例
├── .env.example
├── README.md
└── src/
    └── index.js             # Agent 入口：对话 + list_files / search_files 工具
```

## 技术栈

- **运行时**：Node.js（ESM）
- **模型接入**：`@ai-sdk/openai-compatible`（兼容火山引擎 OpenAI 风格接口）
- **对话与工具**：Vercel AI SDK（`ai`）+ `generateText` + `tool`（zod 入参）

## 扩展

- 在 `src/index.js` 的 `tools` 中增加新 `tool` 即可扩展更多能力（如读文件内容、执行命令等）。
- 更换 `VOLCENGINE_MODEL` 或修改 `volcengine.config.json` 中的 `models` 可切换不同模型。


## 测试结果
```
> openagent-volcengine@1.0.0 start
> node src/index.js

火山引擎 Agent 已启动。支持对话与查文件任务（如：列出当前目录文件、搜索包含某关键词的文件）。输入 exit 退出。


你: 你好
Agent: 你好！请问有什么我可以帮你的吗？比如需要我帮你查看目录文件或者搜索文件吗？

你: 你可以帮我查看当前目录有哪些文件吗
Agent: 当前目录下的内容如下：
📄 文件：
- .env.example
- README.md
- package-lock.json
- package.json
- volcengine.config.json

📂 目录：
- node_modules
- src

```
