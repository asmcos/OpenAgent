/**
 * 应用层注册 provider：仅当用户在 config.json 中配置对应 key 时才会用到
 * 可在此扩展更多 provider（如 ollama、openai 等）
 */
import { registerProvider } from '@openagent/core';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

registerProvider('volcengine', (options) => {
  const { baseURL = 'https://ark.cn-beijing.volces.com/api/v3', apiKey, name = 'volcengine' } = options;
  if (!apiKey) throw new Error('volcengine 需要 options.apiKey');
  return createOpenAICompatible({ name, baseURL, apiKey });
});

registerProvider('ollama', (options) => {
  const { baseURL = 'http://localhost:11434/v1', name = 'ollama' } = options;
  return createOpenAICompatible({ name, baseURL, apiKey: 'ollama' });
});
