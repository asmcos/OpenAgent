/**
 * Agent：绑定 LangChain 模型 + 动态 tools，执行对话与多轮 tool 调用
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

/**
 * 将通用消息格式转为 LangChain 消息数组
 * @param {Array<{ role: 'user' | 'assistant' | 'system', content: string }>} messages
 * @returns {import('@langchain/core/messages').BaseMessage[]}
 */
function toLangChainMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'user') return new HumanMessage(m.content);
    if (m.role === 'assistant') return new AIMessage(m.content);
    if (m.role === 'system') return new SystemMessage(m.content);
    return new HumanMessage(m.content);
  });
}

/**
 * 创建 Agent 运行器（基于 LangChain LangGraph ReAct Agent）
 * @param {object} opts
 * @param {import('@langchain/core/language_models/chat_models').BaseChatModel} opts.model - LangChain 聊天模型（如 ChatOpenAI）
 * @param {() => import('@langchain/core/tools').StructuredToolInterface[]} opts.getTools - 每次调用时获取当前工具集合（支持动态注册）
 * @param {string} [opts.systemPrompt] - 系统提示词
 * @param {number} [opts.maxSteps=5] - 单轮最大 tool 步数（LangGraph 内部会使用）
 */
export function createAgent({ model, getTools, systemPrompt = '', maxSteps = 5 }) {
  return {
    /**
     * 执行一轮对话（可含多次 tool 调用）
     * @param {Array<{ role: 'user' | 'assistant' | 'system', content: string }>} messages - 含历史
     * @returns {Promise<{ text: string, finishReason?: string }>}
     */
    async run(messages) {
      const agent = createReactAgent({ llm: model, tools: getTools() });
      const full = [
        ...(systemPrompt ? [new SystemMessage(systemPrompt)] : []),
        ...toLangChainMessages(messages),
      ];
      // 提高图递归上限，避免多轮 tool 调用时触发 GRAPH_RECURSION_LIMIT（默认 25）
      const recursionLimit = Math.max(50, maxSteps * 12);
      const result = await agent.invoke(
        { messages: full },
        { recursionLimit }
      );
      const last = result.messages[result.messages.length - 1];
      const text = last?.content && typeof last.content === 'string' ? last.content : (Array.isArray(last?.content) ? last.content.map((c) => (c.type === 'text' ? c.text : '')).join('') : '');
      return { text: text ?? '', finishReason: undefined };
    },

    /**
     * 便捷方法：用户一条输入 + 历史，返回助手回复
     */
    async chat(userInput, history = []) {
      const messages = [...history, { role: 'user', content: userInput }];
      return this.run(messages);
    },
  };
}
