/**
 * runTask 多轮任务示例：从仓库根目录运行
 *
 * 默认与 example.js 一致：DEFAULT_PROVIDER=ollama，DEFAULT_MODEL=kimi-k2.5:cloud。
 * 运行：npm run task-example（不设 env 则用上述默认）
 * 或：OPENAGENT_PROVIDER=volcengine npm run task-example 等覆盖。
 *
 * 要求：config.json 已配置对应 provider 和 models；非 ollama 时需 .env / 环境变量 API Key。
 */
import 'dotenv/config';
import '@openagent/app/src/providers/register.js';
import {
  createProvider,
  ToolRegistry,
  createAgent,
  getProviderConfig,
  getFirstProviderKey,
  getEnvPrefix,
  trimHistory,
  runTask,
} from '@openagent/core';
import { defaultTools } from '@openagent/app/src/tools/index.js';

// 与 example.js 一致：默认 provider / 模型
const DEFAULT_PROVIDER = 'ollama';
const DEFAULT_MODEL = 'kimi-k2.5:cloud';

const cwd = process.cwd();
const providerKey =
  process.env.OPENAGENT_PROVIDER || DEFAULT_PROVIDER || getFirstProviderKey(cwd);
const cfg = providerKey ? getProviderConfig(providerKey, cwd) : null;

if (!providerKey || !cfg) {
  console.error('请在项目根 config.json 中配置至少一个 provider，或设置 OPENAGENT_PROVIDER');
  process.exit(1);
}

const prefix = providerKey ? getEnvPrefix(providerKey) : undefined;
const apiKeyFromEnv = prefix ? process.env[`${prefix}_API_KEY`] : process.env.OPENAGENT_API_KEY;
const apiKey = apiKeyFromEnv || cfg?.providerConfig?.options?.apiKey;
const needsApiKey = providerKey !== 'ollama';

if (needsApiKey && !apiKey && !cfg.providerConfig?.options?.apiKey) {
  console.error('请在 .env 或 config.json 中配置对应 provider 的 API Key');
  process.exit(1);
}

cfg.providerConfig.options.apiKey =
  apiKey || cfg.providerConfig.options.apiKey || (providerKey === 'ollama' ? 'ollama' : undefined);
if (prefix && process.env[`${prefix}_BASE_URL`]) {
  cfg.providerConfig.options.baseURL = process.env[`${prefix}_BASE_URL`];
}

const provider = createProvider(cfg.providerConfig);
const modelId =
  (prefix ? process.env[`${prefix}_MODEL`] : null) ||
  process.env.OPENAGENT_MODEL ||
  (providerKey === DEFAULT_PROVIDER ? DEFAULT_MODEL : null) ||
  cfg?.modelId;

if (!modelId) {
  console.error('请在 config 的 models 中配置至少一个模型，或设置 OPENAGENT_MODEL / 对应 provider 的 _MODEL 环境变量');
  process.exit(1);
}

const model = provider.chatModel(modelId);

const registry = new ToolRegistry();
registry.registerAll(defaultTools);

const agent = createAgent({
  model,
  getTools: () => registry.getTools(),
  systemPrompt: `你是一个可以分步骤完成任务的助手。优先使用工具在当前项目里查找、阅读和总结文件。`,
  maxSteps: 5,
});

const goal =
  '在当前项目中帮我找到所有 README 相关的文件（包括根目录 README.md 和 packages 下的 README），' +
  '然后给出一个简短总结，说明这个项目是做什么的、核心模块有哪些。';

const { steps, history, final } = await runTask({
  agent,
  goal,
  history: [],
  maxRounds: 3,
  trimHistory: (msgs) => trimHistory(msgs, { maxMessages: 25, maxApproxChars: 12000 }),
  onStep: (s) => {
    console.log(`\n[ROUND ${s.round}]`);
    console.log((s.reply || '').slice(0, 200), '...');
  },
  chatOptions: {
    toolRetries: 1,
  },
});

console.log('\n=== FINAL ===');
console.log(final?.reply || '（无结果）');

