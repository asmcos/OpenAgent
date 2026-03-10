/**
 * OpenAgent 应用入口：通用 Agent REPL，从 config 创建 Provider，动态注册 Tools
 * Provider 由 config.json 或 OPENAGENT_PROVIDER 决定；需先注册（见 providers/register.js）
 */
import 'dotenv/config';
import './providers/register.js';
import { createInterface } from 'readline';
import { join } from 'path';
import {
  createProvider,
  ToolRegistry,
  createAgent,
  getProviderConfig,
  getFirstProviderKey,
  getEnvPrefix,
} from '@openagent/core';
import { fileTools } from './tools/files.js';

const cwd = process.cwd();
const rootCwd = join(cwd, '..', '..');
const providerKey =
  process.env.OPENAGENT_PROVIDER ||
  getFirstProviderKey(cwd) ||
  getFirstProviderKey(rootCwd);

const cfg = providerKey
  ? (getProviderConfig(providerKey, cwd) ?? getProviderConfig(providerKey, rootCwd))
  : null;

const prefix = providerKey ? getEnvPrefix(providerKey) : undefined;
const apiKeyFromEnv = prefix ? process.env[`${prefix}_API_KEY`] : process.env.OPENAGENT_API_KEY;
const apiKey = apiKeyFromEnv || cfg?.providerConfig?.options?.apiKey;

let provider, model;
if (cfg && (apiKey || cfg.providerConfig?.options?.apiKey)) {
  cfg.providerConfig.options.apiKey = apiKey || cfg.providerConfig.options.apiKey;
  provider = createProvider(cfg.providerConfig);
  const modelId = cfg.modelId || (prefix ? process.env[`${prefix}_MODEL`] : null) || process.env.OPENAGENT_MODEL;
  if (!modelId) {
    console.error('请在 config 的 models 中配置至少一个模型，或设置 OPENAGENT_MODEL / 对应 provider 的 _MODEL 环境变量');
    process.exit(1);
  }
  model = provider.chatModel(modelId);
}

if (!provider || !model) {
  console.error(
    '请添加 config.json 并配置至少一个 provider，或设置 OPENAGENT_PROVIDER；API Key 通过 .env 或 config 的 options.apiKey 配置'
  );
  process.exit(1);
}

const registry = new ToolRegistry();
registry.registerAll(fileTools);

const systemPrompt = `你是一个有帮助的助手，可以帮用户对话或执行简单任务。
你可以使用以下工具：
- list_files: 列出某目录下的文件和子目录。
- search_files: 在目录下按文件名关键词搜索。
当用户想「查文件」「看看某目录有什么」「找包含某关键词的文件」时，请使用相应工具，然后根据结果用中文简洁回复。`;

const agent = createAgent({
  model,
  getTools: () => registry.getTools(),
  systemPrompt,
  maxSteps: 5,
});

const history = [];
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask() {
  rl.question('\n你: ', async (line) => {
    const input = line.trim();
    if (!input) {
      ask();
      return;
    }
    if (input === 'exit' || input === 'quit') {
      console.log('再见。');
      rl.close();
      process.exit(0);
    }
    if (input === '/tools') {
      console.log('已注册工具:', registry.listNames().join(', '));
      ask();
      return;
    }

    process.stdout.write('Agent: ');
    try {
      const { text } = await agent.chat(input, history);
      console.log(text || '（无回复）');
      history.push({ role: 'user', content: input });
      history.push({ role: 'assistant', content: text || '' });
    } catch (err) {
      console.error('错误:', err.message);
    }
    ask();
  });
}

console.log(`OpenAgent 已启动（provider: ${providerKey}）。输入 /tools 查看已注册工具，exit 退出。\n`);
ask();
