/**
 * 应用层注册 provider：仅当用户在 config.json 中配置对应 key 时才会用到
 * 使用 LangChain ChatOpenAI（OpenAI 兼容接口：火山、Ollama 等）
 */
import { registerProvider } from '@openagent/core';
import { ChatOpenAI } from '@langchain/openai';

registerProvider('volcengine', (options) => {
  const { baseURL = 'https://ark.cn-beijing.volces.com/api/v3', apiKey, name = 'volcengine' } = options;
  if (!apiKey) throw new Error('volcengine 需要 options.apiKey');
  return {
    chatModel(modelId) {
      return new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: { baseURL },
        model: modelId,
        temperature: 0.7,
      });
    },
  };
});

registerProvider('ollama', (options) => {
  const { baseURL = 'http://localhost:11434/v1', name = 'ollama' } = options;
  return {
    chatModel(modelId) {
      return new ChatOpenAI({
        openAIApiKey: 'ollama',
        configuration: { baseURL },
        model: modelId,
        temperature: 0.7,
      });
    },
  };
});
