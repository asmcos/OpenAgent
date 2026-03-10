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
import { defaultTools } from './tools/index.js';

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
const needsApiKey = providerKey !== 'ollama';

let provider, model;
if (cfg && (apiKey || cfg.providerConfig?.options?.apiKey || !needsApiKey)) {
  cfg.providerConfig.options.apiKey =
    apiKey || cfg.providerConfig.options.apiKey || (providerKey === 'ollama' ? 'ollama' : undefined);
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
    needsApiKey
      ? '请添加 config.json 并配置至少一个 provider，或设置 OPENAGENT_PROVIDER；API Key 通过 .env 或 config 的 options.apiKey 配置'
      : '请添加 config.json 并配置至少一个 provider，或设置 OPENAGENT_PROVIDER'
  );
  process.exit(1);
}

const registry = new ToolRegistry();
registry.registerAll(defaultTools);

const systemPrompt = `你是一个有帮助的助手，可以帮用户对话或执行文件、搜索等任务。
可用工具：
- list_files: 列出目录下的文件和子目录（首次查看用）。
- search_files: 按文件名关键词搜索。
- read_file: 读取文件内容。
- write_file: 写入或覆盖文件。
- append_file: 向文件末尾追加内容。
- delete_file: 删除文件或目录。
- grep: 在文件中按内容搜索（支持正则）。
- find: 按文件名模式查找（支持 * 通配，如 *.js）。
按用户意图选用工具，用中文简洁回复。`;

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
