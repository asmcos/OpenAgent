/**
 * LangChain DynamicStructuredTool：调用与 @tencent-weixin/openclaw-weixin 相同的 iLink HTTP API。
 *
 * 凭证：优先读环境变量 WEIXIN_ILINK_TOKEN；示例入口会先调用 ensureWeixinLogin 从
 * ~/.openagent/weixin-ilink.json 加载或触发终端扫码（与插件同 GET 流程）。
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { sendTextMessage, getUpdates, defaultBaseUrl, defaultToken } from '@openagent/core';

const weixinSendText = new DynamicStructuredTool({
  name: 'weixin_send_text',
  description:
    '通过微信 iLink Bot 向用户发送一条文本（OpenClaw Weixin 插件同款协议）。' +
    '需要 WEIXIN_ILINK_TOKEN；to_user_id、context_token 与入站消息一致。',
  schema: z.object({
    text: z.string().describe('文本内容'),
    to_user_id: z
      .string()
      .optional()
      .nullable()
      .describe('收件人；可省略若已设置 WEIXIN_DEFAULT_TO_USER_ID'),
    context_token: z
      .string()
      .optional()
      .nullable()
      .describe('会话 token（来自 getupdates 入站）；可省略若已设置 WEIXIN_DEFAULT_CONTEXT_TOKEN'),
  }),
  func: async ({ text, to_user_id, context_token }) => {
    const token = defaultToken();
    if (!token) {
      return JSON.stringify({
        ok: false,
        error: '请设置环境变量 WEIXIN_ILINK_TOKEN（openclaw channels login 后写入或从凭证导出）',
      });
    }
    const to =
      (to_user_id && String(to_user_id).trim()) ||
      process.env.WEIXIN_DEFAULT_TO_USER_ID?.trim() ||
      '';
    const ctx =
      (context_token && String(context_token).trim()) ||
      process.env.WEIXIN_DEFAULT_CONTEXT_TOKEN?.trim() ||
      '';
    if (!to) {
      return JSON.stringify({
        ok: false,
        error: '缺少 to_user_id：请传入或设置 WEIXIN_DEFAULT_TO_USER_ID',
      });
    }
    try {
      await sendTextMessage({
        baseUrl: defaultBaseUrl(),
        token,
        toUserId: to,
        text,
        contextToken: ctx || undefined,
      });
      return JSON.stringify({ ok: true });
    } catch (e) {
      return JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

const weixinGetUpdates = new DynamicStructuredTool({
  name: 'weixin_get_updates',
  description:
    '长轮询拉取一条或多条入站消息（与插件 getUpdates 相同）。返回 msgs 与新的 get_updates_buf，用于更新 context_token。',
  schema: z.object({
    get_updates_buf: z
      .string()
      .optional()
      .nullable()
      .describe('上次返回的游标，首次传空字符串'),
  }),
  func: async ({ get_updates_buf }) => {
    const token = defaultToken();
    if (!token) {
      return JSON.stringify({
        ok: false,
        error: '请设置 WEIXIN_ILINK_TOKEN',
      });
    }
    try {
      const resp = await getUpdates({
        baseUrl: defaultBaseUrl(),
        token,
        get_updates_buf: get_updates_buf ?? '',
      });
      return JSON.stringify({ ok: true, resp });
    } catch (e) {
      return JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

export const openclawWeixinTools = {
  weixin_send_text: weixinSendText,
  weixin_get_updates: weixinGetUpdates,
};
