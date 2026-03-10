/**
 * Agent：绑定 model + 动态 tools，执行对话与多轮 tool 调用
 */
import { generateText } from 'ai';

/**
 * 创建 Agent 运行器
 * @param {object} opts
 * @param {import('ai').LanguageModelV1} opts.model - 已创建好的聊天模型
 * @param {() => Record<string, import('ai').CoreTool>} opts.getTools - 每次调用时获取当前工具集合（支持动态注册）
 * @param {string} [opts.systemPrompt] - 系统提示词
 * @param {number} [opts.maxSteps=5] - 单轮最大 tool 步数
 */
export function createAgent({ model, getTools, systemPrompt = '', maxSteps = 5 }) {
  return {
    /**
     * 执行一轮对话（可含多次 tool 调用）
     * @param {Array<{ role: 'user' | 'assistant' | 'system', content: string }>} messages - 含历史
     * @returns {Promise<{ text: string, finishReason?: string }>}
     */
    async run(messages) {
      const tools = getTools();
      const hasTools = Object.keys(tools).length > 0;
      const result = await generateText({
        model,
        messages,
        ...(hasTools ? { tools, maxSteps } : {}),
      });
      return {
        text: result.text ?? '',
        finishReason: result.finishReason,
      };
    },

    /**
     * 便捷方法：用户一条输入 + 历史，返回助手回复
     */
    async chat(userInput, history = []) {
      const messages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...history,
        { role: 'user', content: userInput },
      ];
      return this.run(messages);
    },
  };
}
