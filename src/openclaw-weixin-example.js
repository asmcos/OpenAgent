/**
 * LangChain + 微信 iLink（与 @tencent-weixin/openclaw-weixin 使用同一套 HTTP 协议）示例
 *
 * 登录（与 OpenClaw 微信插件同协议）：
 * - 首次运行：交互式终端会显示二维码，微信扫码后凭证写入 ~/.openagent/weixin-ilink.json
 * - 或先执行：npm run weixin-login
 * - 仍可使用环境变量 WEIXIN_ILINK_TOKEN 覆盖
 * - 跳过扫码：node src/openclaw-weixin-example.js --no-weixin-login（仅使用已有 .env / 凭证文件）
 *
 * 入站：后台 getUpdates；默认将文本交给 Agent，回复经 sendMessage 自动发回微信。
 * --no-weixin-auto-reply：只打印入站，不经过 Agent、不回发。
 * --no-weixin-inbound：关闭入站轮询。
 *
 * 运行：npm run openclaw-weixin-example
 */
import 'dotenv/config';
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
import { sendTextMessage, defaultBaseUrl } from './lib/openclawWeixinIlink.js';
import { defaultTools } from '@openagent/app/src/tools/index.js';
import { openclawWeixinTools } from './openclawWeixinTools.js';
import { ensureWeixinLogin } from './lib/weixinIlinkLogin.js';
import { startWeixinInboundPoller } from './lib/weixinInboundPoller.js';

const DEFAULT_PROVIDER = 'ollama';
const DEFAULT_MODEL = 'kimi-k2.5:cloud';

const skipWeixinQr = process.argv.includes('--no-weixin-login');
const skipWeixinInbound = process.argv.includes('--no-weixin-inbound');
const skipWeixinAutoReply = process.argv.includes('--no-weixin-auto-reply');

const WEIXIN_TOOL_NAMES = new Set(['weixin_send_text', 'weixin_get_updates']);

(async function main() {
  const cwd = process.cwd();
  const providerKey =
    process.env.OPENAGENT_PROVIDER || DEFAULT_PROVIDER || getFirstProviderKey(cwd);
  const cfg = providerKey ? getProviderConfig(providerKey, cwd) : null;

  if (!providerKey || !cfg) {
    console.error('请配置 config.json 中的 provider，或设置 OPENAGENT_PROVIDER');
    process.exit(1);
  }

  const prefix = providerKey ? getEnvPrefix(providerKey) : undefined;
  const apiKeyFromEnv = prefix ? process.env[`${prefix}_API_KEY`] : process.env.OPENAGENT_API_KEY;
  const apiKey = apiKeyFromEnv || cfg?.providerConfig?.options?.apiKey;
  const needsApiKey = providerKey !== 'ollama';

  if (needsApiKey && !apiKey && !cfg.providerConfig?.options?.apiKey) {
    console.error('请配置 API Key');
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
    console.error('请配置模型 ID 或 OPENAGENT_MODEL');
    process.exit(1);
  }

  const model = provider.chatModel(modelId);

  const wx = await ensureWeixinLogin({ skipInteractive: skipWeixinQr || !process.stdin.isTTY });
  if (wx.source === 'none' && !process.env.WEIXIN_ILINK_TOKEN?.trim()) {
    console.log(
      '\n提示：未检测到微信凭证。可设置 WEIXIN_ILINK_TOKEN，或去掉 --no-weixin-login 后重新运行以扫码；或执行 npm run weixin-login\n'
    );
  } else if (wx.source === 'file' || wx.source === 'qr') {
    console.log(`\n微信 iLink：已加载凭证（来源: ${wx.source === 'qr' ? '本次扫码' : '本地文件'}）\n`);
  }

  const registry = new ToolRegistry();
  registry.registerAll(defaultTools);
  registry.registerAll(openclawWeixinTools);

  const agent = createAgent({
    model,
    getTools: () => registry.getTools(),
    systemPrompt: `你是助手，可使用文件与搜索工具，也可使用微信 iLink 工具：
- weixin_send_text：发文本给用户（需 token、to_user_id、context_token）
- weixin_get_updates：长轮询拉取入站消息与游标
协议与 npm 包 @tencent-weixin/openclaw-weixin 一致，非公众号网页授权接口。`,
    maxSteps: 8,
  });

  /** 仅用于微信入站自动回复：去掉微信工具，避免与程序代发重复 */
  const agentWeixin = createAgent({
    model,
    getTools: () => registry.getTools().filter((t) => !WEIXIN_TOOL_NAMES.has(t.name)),
    systemPrompt: `用户正在通过微信与你对话。请用中文直接给出可发送的回复内容；需要时可使用文件/搜索等工具。
不要调用任何微信相关工具，你的文字会由程序自动发回微信。回复尽量简洁。`,
    maxSteps: 8,
  });

  /** 每个微信用户 id 一条对话历史 */
  const wxHistories = new Map();

  async function handleWeixinInbound({ text, fromUserId, contextToken }) {
    try {
      let hist = wxHistories.get(fromUserId) || [];
      hist = trimHistory(hist, { maxMessages: 24, maxApproxChars: 12000 });
      const userLine = text;
      const { text: reply } = await agentWeixin.chat(userLine, hist, { toolRetries: 1 });
      const out = (reply || '（无回复）').trim() || '…';
      hist.push({ role: 'user', content: userLine });
      hist.push({ role: 'assistant', content: out });
      wxHistories.set(fromUserId, hist);

      await sendTextMessage({
        baseUrl: defaultBaseUrl(),
        token: process.env.WEIXIN_ILINK_TOKEN,
        toUserId: fromUserId,
        text: out,
        contextToken,
      });
      console.log(`\n[微信] 已自动发回 (${out.length} 字): ${out.slice(0, 300)}${out.length > 300 ? '…' : ''}\n`);
    } catch (e) {
      console.error('\n[微信] Agent 回复或发送失败:', e instanceof Error ? e.message : e);
    }
  }

  let stopInbound = () => {};
  if (!skipWeixinInbound && process.env.WEIXIN_ILINK_TOKEN?.trim()) {
    stopInbound = startWeixinInboundPoller(
      skipWeixinAutoReply
        ? {}
        : {
            onUserTextMessage: handleWeixinInbound,
          }
    );
    console.log(
      skipWeixinAutoReply
        ? '微信入站：仅打印消息（--no-weixin-auto-reply）。\n'
        : '微信入站：文本将经 Agent 处理后自动发回微信。\n'
    );
  } else if (!skipWeixinInbound && !process.env.WEIXIN_ILINK_TOKEN?.trim()) {
    console.log('（未配置 WEIXIN_ILINK_TOKEN，已跳过入站轮询）\n');
  }

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
        stopInbound();
        rl.close();
        process.exit(0);
      }
      if (input === '/tools') {
        console.log(registry.listNames().join(', '));
        ask();
        return;
      }
      try {
        const { text } = await agent.chat(input, history);
        console.log('\nAgent:', text || '（无回复）');
        history.push({ role: 'user', content: input });
        history.push({ role: 'assistant', content: text || '' });
      } catch (err) {
        console.error('错误:', err.message);
      }
      ask();
    });
  }

  console.log('已注册工具:', registry.listNames().join(', '));
  console.log(
    '微信：凭证在 ~/.openagent/weixin-ilink.json；入站自动回复使用独立对话历史（按用户 id）。'
  );
  console.log('输入 /tools 列出工具，exit 退出。\n');

  process.once('SIGINT', () => {
    stopInbound();
    try {
      rl.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });

  ask();
})();
