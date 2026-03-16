/**
 * Skill 使用示例：在应用层加载 skills/*.md，拼进 systemPrompt，再跑 Agent
 *
 * 说明：OpenAgent 不在 core 里内置 skill，由用户在例子/应用中按需加载。
 * 本示例演示：从 src/skills/ 读取 .md 文件，合并为「技能说明」注入 system prompt。
 *
 * 默认与 example.js 一致：DEFAULT_PROVIDER=ollama，DEFAULT_MODEL=kimi-k2.5:cloud
 * 运行：npm run skill-example
 */
import 'dotenv/config';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import '@openagent/app/src/providers/register.js';
import { createInterface } from 'readline';
import {
  createProvider,
  ToolRegistry,
  createAgent,
  getProviderConfig,
  getFirstProviderKey,
  getEnvPrefix,
  trimHistory,
} from '@openagent/core';
import { defaultTools } from '@openagent/app/src/tools/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PROVIDER = 'ollama';
const DEFAULT_MODEL = 'kimi-k2.5:cloud';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPIN_INTERVAL = 80;

function startSpinner(label = '执行中') {
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

/** 从目录加载所有 .md 作为 skill，返回拼接后的字符串 */
function loadSkillsFromDir(skillsDir) {
  if (!existsSync(skillsDir)) return '';
  const files = readdirSync(skillsDir).filter((f) => f.endsWith('.md'));
  const parts = [];
  for (const f of files.sort()) {
    const path = join(skillsDir, f);
    try {
      parts.push(readFileSync(path, 'utf-8'));
    } catch (_) {
      // skip
    }
  }
  if (parts.length === 0) return '';
  return '\n\n---\n\n## 当前启用的 Skills\n\n' + parts.join('\n\n---\n\n');
}

const cwd = process.cwd();
const providerKey =
  process.env.OPENAGENT_PROVIDER || DEFAULT_PROVIDER || getFirstProviderKey(cwd);
const cfg = providerKey ? getProviderConfig(providerKey, cwd) : null;

if (!providerKey || !cfg) {
  console.error('请添加 config.json 并配置至少一个 provider，或设置 OPENAGENT_PROVIDER');
  process.exit(1);
}

const prefix = providerKey ? getEnvPrefix(providerKey) : undefined;
const apiKeyFromEnv = prefix ? process.env[`${prefix}_API_KEY`] : process.env.OPENAGENT_API_KEY;
const apiKey = apiKeyFromEnv || cfg?.providerConfig?.options?.apiKey;
const needsApiKey = providerKey !== 'ollama';

if (needsApiKey && !apiKey && !cfg.providerConfig?.options?.apiKey) {
  console.error('请设置 .env 或 config 中对应 provider 的 API Key');
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
  console.error('请在 config 的 models 中配置至少一个模型，或设置 OPENAGENT_MODEL');
  process.exit(1);
}

const model = provider.chatModel(modelId);

const registry = new ToolRegistry();
registry.registerAll(defaultTools);

// 从 src/skills/ 加载 skill 文档并拼进 system prompt
const skillsDir = join(__dirname, 'skills');
const skillsText = loadSkillsFromDir(skillsDir);

const basePrompt = `你是一个有帮助的助手。可用工具：list_files、search_files、read_file、write_file、append_file、delete_file、grep、find。按用户意图选用工具，用中文简洁回复。`;
const systemPrompt = skillsText ? basePrompt + skillsText : basePrompt;

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
    if (input === '/skills') {
      console.log('已加载 skills 目录:', skillsDir);
      console.log('内容已注入 system prompt（见上方说明）。');
      ask();
      return;
    }

    const stopSpinner = startSpinner('Agent');
    try {
      const trimmed = trimHistory(history, { maxMessages: 25, maxApproxChars: 12000 });
      const { text } = await agent.chat(input, trimmed, {
        onToolStart: (name) => process.stdout.write(`  → ${name}\n`),
        onToolEnd: (name) => process.stdout.write(`  ← ${name}\n`),
        toolRetries: 1,
      });
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

console.log('Skill 示例已启动（provider: %s, model: %s）', providerKey, modelId);
console.log('已从 %s 加载 skill 并注入 system prompt。', skillsDir);
console.log('输入 /skills 查看说明，或直接提问（例如：帮我审查一段代码、给重构建议）。exit 退出。\n');
ask();
