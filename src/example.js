/**
 * 使用 @openagent/core 库的示例（从仓库根目录运行）
 *
 * 交互模式：先注册 provider，再从 config.json 读取并创建 Agent；等待回复时显示转圈动画。
 *
 * 运行：npm run example  或  node src/example.js
 * 配置：项目根 config.json 中至少一个 provider（如 volcengine、ollama）；.env 中对应 API Key
 */
import 'dotenv/config';
import '@openagent/app/src/providers/register.js';
import { createInterface } from 'readline';
import { tool } from 'ai';
import { z } from 'zod';
import {
  createProvider,
  ToolRegistry,
  createAgent,
  getProviderConfig,
  getFirstProviderKey,
  getEnvPrefix,
} from '@openagent/core';
import { defaultTools } from '@openagent/app/src/tools/index.js';

// ---------- 默认 provider / 模型：二选一，注释一组、取消注释另一组即可切换 ----------
// 使用 Ollama（本地或云）
const DEFAULT_PROVIDER = 'ollama';
const DEFAULT_MODEL = 'kimi-k2.5:cloud';

// 使用火山引擎（改用火山时：注释上面两行，取消下面两行注释）
// const DEFAULT_PROVIDER = 'volcengine';
// const DEFAULT_MODEL = 'doubao-seed-2.0-lite';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPIN_INTERVAL = 80;

function startSpinner(label = '思考中') {
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r  ${SPINNER[i % SPINNER.length]} ${label}...   `);
    i += 1;
  }, SPIN_INTERVAL);
  return () => {
    clearInterval(timer);
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
  };
}

const cwd = process.cwd();
// 优先级：环境变量 OPENAGENT_PROVIDER > 本文件默认（上面 DEFAULT_*）> config 第一个
const providerKey =
  process.env.OPENAGENT_PROVIDER || DEFAULT_PROVIDER || getFirstProviderKey(cwd);
const cfg = providerKey ? getProviderConfig(providerKey, cwd) : null;

const prefix = providerKey ? getEnvPrefix(providerKey) : undefined;
const apiKeyFromEnv = prefix ? process.env[`${prefix}_API_KEY`] : process.env.OPENAGENT_API_KEY;
const apiKey = apiKeyFromEnv || cfg?.providerConfig?.options?.apiKey;

if (!providerKey || !cfg) {
  console.error('请添加 config.json 并配置至少一个 provider，或设置 OPENAGENT_PROVIDER');
  process.exit(1);
}
const needsApiKey = providerKey !== 'ollama';
if (needsApiKey && !apiKey && !cfg.providerConfig?.options?.apiKey) {
  console.error('请设置 .env 中对应 provider 的 API Key，或 config 中 options.apiKey');
  process.exit(1);
}

cfg.providerConfig.options.apiKey =
  apiKey || cfg.providerConfig.options.apiKey || (providerKey === 'ollama' ? 'ollama' : undefined);
if (prefix && process.env[`${prefix}_BASE_URL`]) {
  cfg.providerConfig.options.baseURL = process.env[`${prefix}_BASE_URL`];
}
const provider = createProvider(cfg.providerConfig);
// 优先级（模型）：provider 专属 env 覆盖 > OPENAGENT_MODEL > 本文件默认（仅对 DEFAULT_PROVIDER 生效）> config 第一个
const modelId =
  (prefix ? process.env[`${prefix}_MODEL`] : null) ||
  process.env.OPENAGENT_MODEL ||
  (providerKey === DEFAULT_PROVIDER ? DEFAULT_MODEL : null) ||
  cfg?.modelId;
if (!modelId) {
  console.error('请在 config 的 models 中配置至少一个模型，或设置 OPENAGENT_MODEL');
  process.exit(1);
}
const model = provider.chatModel(modelId);

const registry = new ToolRegistry();
registry.registerAll(defaultTools);
registry.register(
  'echo',
  tool({
    description: '回显用户传入的文本，用于测试工具调用',
    parameters: z.object({ message: z.string().describe('要回显的文本') }),
    execute: async ({ message }) => ({ echoed: message }),
  })
);

const agent = createAgent({
  model,
  getTools: () => registry.getTools(),
  systemPrompt: `你是一个有帮助的助手，可以帮用户对话或执行文件、搜索等任务。
可用工具：list_files（列目录）、search_files（按文件名搜）、read_file、write_file、append_file、delete_file、grep（按内容搜）、find（按文件名模式）、echo。
按用户意图选用工具，用中文简洁回复。`,
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

    const stopSpinner = startSpinner('Agent');
    try {
      const { text } = await agent.chat(input, history);
      stopSpinner();
      console.log('Agent:', text || '（无回复）');
      history.push({ role: 'user', content: input });
      history.push({ role: 'assistant', content: text || '' });
    } catch (err) {
      stopSpinner();
      console.error('错误:', err.message);
    }
    ask();
  });
}

console.log('已注册工具:', registry.listNames().join(', '));
console.log('Provider:', providerKey);
console.log('\n交互模式。输入 exit 或 quit 退出。\n');
ask();
