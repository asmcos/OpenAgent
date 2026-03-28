/**
 * 与 @tencent-weixin/openclaw-weixin 中 src/api/api.ts 对齐的 iLink HTTP 调用（无 OpenClaw 插件依赖）。
 * 扫码见 weixinIlinkLogin.js；亦可继续用 OpenClaw：openclaw channels login --channel openclaw-weixin
 * 端点：ilink/bot/getupdates、ilink/bot/sendmessage 等。
 * @see https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin
 */
import { createRequire } from 'module';
import { randomBytes } from 'crypto';

const require = createRequire(import.meta.url);

/** @type {{ version?: string; ilink_appid?: string }} */
let weixinPkg = {};
try {
  weixinPkg = require('@tencent-weixin/openclaw-weixin/package.json');
} catch {
  weixinPkg = { version: '2.1.1', ilink_appid: 'bot' };
}

const CHANNEL_VERSION = weixinPkg.version ?? '2.1.1';
const ILINK_APP_ID = weixinPkg.ilink_appid ?? 'bot';

function buildClientVersion(version) {
  const parts = String(version)
    .split('.')
    .map((p) => parseInt(p, 10));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}

const ILINK_APP_CLIENT_VERSION = buildClientVersion(CHANNEL_VERSION);

export function buildBaseInfo() {
  return { channel_version: CHANNEL_VERSION };
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function randomWechatUin() {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32 >>> 0), 'utf-8').toString('base64');
}

function buildCommonHeaders() {
  const headers = {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION),
  };
  const tag = process.env.WEIXIN_SK_ROUTE_TAG?.trim();
  if (tag) {
    headers.SKRouteTag = tag;
  }
  return headers;
}

function buildPostHeaders(token, body) {
  const headers = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
    'X-WECHAT-UIN': randomWechatUin(),
    ...buildCommonHeaders(),
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

const DEFAULT_LONG_POLL_MS = 35_000;
const DEFAULT_API_MS = 15_000;

/**
 * GET（与插件 apiGetFetch 一致：仅 buildCommonHeaders，无 Bearer）
 * @param {{ baseUrl: string; endpoint: string; timeoutMs?: number; label?: string }} p
 */
export async function apiGetFetch(p) {
  const base = ensureTrailingSlash(p.baseUrl);
  const url = new URL(p.endpoint, base).toString();
  const timeoutMs = p.timeoutMs ?? 15_000;
  const label = p.label ?? 'GET';
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildCommonHeaders(),
      signal: controller.signal,
    });
    clearTimeout(t);
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`${label} HTTP ${res.status}: ${rawText.slice(0, 500)}`);
    }
    return rawText;
  } catch (err) {
    clearTimeout(t);
    throw err;
  }
}

async function apiPostFetch({ baseUrl, endpoint, body, token, timeoutMs, label }) {
  const base = ensureTrailingSlash(baseUrl);
  const url = new URL(endpoint, base).toString();
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildPostHeaders(token, bodyStr),
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(t);
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`${label} HTTP ${res.status}: ${rawText.slice(0, 500)}`);
    }
    return rawText;
  } catch (err) {
    clearTimeout(t);
    throw err;
  }
}

/**
 * 长轮询拉取消息（与插件 getUpdates 一致）
 * @param {{ baseUrl: string; token?: string; get_updates_buf?: string; timeoutMs?: number }} p
 */
export async function getUpdates(p) {
  const timeoutMs = p.timeoutMs ?? DEFAULT_LONG_POLL_MS;
  const payload = {
    get_updates_buf: p.get_updates_buf ?? '',
    base_info: buildBaseInfo(),
  };
  try {
    const rawText = await apiPostFetch({
      baseUrl: p.baseUrl,
      endpoint: 'ilink/bot/getupdates',
      body: payload,
      token: p.token,
      timeoutMs,
      label: 'getUpdates',
    });
    return JSON.parse(rawText);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: p.get_updates_buf };
    }
    throw err;
  }
}

/**
 * 发送文本（与 src/messaging/send.ts 中 buildTextMessageReq + sendMessageApi 一致）
 */
export async function sendTextMessage(p) {
  const {
    baseUrl,
    token,
    toUserId,
    text,
    contextToken,
    clientId,
    timeoutMs,
  } = p;
  const cid =
    clientId ||
    `openagent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const body = {
    msg: {
      from_user_id: '',
      to_user_id: toUserId,
      client_id: cid,
      message_type: 2,
      message_state: 2,
      item_list: text ? [{ type: 1, text_item: { text } }] : [],
      context_token: contextToken ?? undefined,
    },
    base_info: buildBaseInfo(),
  };

  await apiPostFetch({
    baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    body,
    token,
    timeoutMs: timeoutMs ?? DEFAULT_API_MS,
    label: 'sendMessage',
  });
}

export function defaultBaseUrl() {
  return (
    process.env.WEIXIN_ILINK_BASE_URL?.trim() || 'https://ilinkai.weixin.qq.com/'
  );
}

export function defaultToken() {
  return process.env.WEIXIN_ILINK_TOKEN?.trim() || '';
}
