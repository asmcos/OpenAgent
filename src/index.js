/**
 * 火山引擎简单 Agent
 * - 支持多轮对话
 * - 内置工具：查文件（列出目录、按名搜索）
 */
import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';

const baseURL = process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3';
const apiKey = process.env.VOLCENGINE_API_KEY || '6715xxxxxxxxxxxxxxxxx----xxxxxxxxxxxxx';
const modelId = process.env.VOLCENGINE_MODEL || 'doubao-seed-2.0-lite';

if (!apiKey) {
  console.error('请设置环境变量 VOLCENGINE_API_KEY，可从 .env 或 火山方舟控制台 获取');
  process.exit(1);
}

const provider = createOpenAICompatible({
  name: 'volcengine',
  baseURL,
  apiKey,
});

const model = provider.chatModel(modelId);

const listFilesTool = tool({
  description: '列出指定目录下的文件和子目录。用于查看某个路径里有什么文件。',
  parameters: z.object({
    dir: z.string().describe('目录路径，相对当前工作目录或绝对路径'),
    maxEntries: z.number().optional().default(20).describe('最多返回条目数'),
  }),
  execute: async ({ dir, maxEntries }) => {
    const cwd = process.cwd();
    const fullPath = dir.startsWith('/') ? dir : join(cwd, dir);
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      const list = entries.slice(0, maxEntries).map((e) =>
        e.isDirectory() ? `[DIR]  ${e.name}` : `[FILE] ${e.name}`
      );
      const more = entries.length > maxEntries ? `... 共 ${entries.length} 项，仅显示前 ${maxEntries} 项` : '';
      return { path: fullPath, entries: list, more };
    } catch (err) {
      return { error: err.message, path: fullPath };
    }
  },
});

const searchFilesTool = tool({
  description: '在指定目录下按文件名关键词搜索文件或目录（简单包含匹配）。',
  parameters: z.object({
    dir: z.string().describe('要搜索的目录路径'),
    keyword: z.string().describe('文件名包含的关键词'),
    maxEntries: z.number().optional().default(30).describe('最多返回条目数'),
  }),
  execute: async ({ dir, keyword, maxEntries }) => {
    const cwd = process.cwd();
    const fullPath = dir.startsWith('/') ? dir : join(cwd, dir);
    const lowerKeyword = keyword.toLowerCase();
    const results = [];
    try {
      const collect = async (currentDir, depth) => {
        if (depth > 3 || results.length >= maxEntries) return;
        const entries = await readdir(currentDir, { withFileTypes: true });
        for (const e of entries) {
          if (results.length >= maxEntries) break;
          if (e.name.toLowerCase().includes(lowerKeyword)) {
            results.push(e.isDirectory() ? `[DIR]  ${e.name}` : `[FILE] ${e.name}`);
          }
          if (e.isDirectory() && !e.name.startsWith('.')) {
            try {
              await collect(join(currentDir, e.name), depth + 1);
            } catch (_) {}
          }
        }
      };
      await collect(fullPath, 0);
      return { path: fullPath, keyword, results, count: results.length };
    } catch (err) {
      return { error: err.message, path: fullPath };
    }
  },
});

const tools = {
  list_files: listFilesTool,
  search_files: searchFilesTool,
};

const systemPrompt = `你是一个有帮助的助手，可以帮用户对话或执行简单任务。
你可以使用以下工具：
- list_files: 列出某目录下的文件和子目录。
- search_files: 在目录下按文件名关键词搜索。

当用户想「查文件」「看看某目录有什么」「找包含某关键词的文件」时，请使用相应工具，然后根据结果用中文简洁回复。`;

async function runAgent(userInput, history = []) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userInput },
  ];

  const result = await generateText({
    model,
    messages,
    tools,
    maxSteps: 5,
  });

  return { text: result.text || '（无回复）', finishReason: result.finishReason };
}

function runRepl() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const history = [];

  const ask = () => {
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

      process.stdout.write('Agent: ');
      try {
        const { text } = await runAgent(input, history);
        console.log(text || '（无回复）');
        history.push({ role: 'user', content: input });
        history.push({ role: 'assistant', content: text || '' });
      } catch (err) {
        console.error('错误:', err.message);
      }
      ask();
    });
  };

  console.log('火山引擎 Agent 已启动。支持对话与查文件任务（如：列出当前目录文件、搜索包含某关键词的文件）。输入 exit 退出。\n');
  ask();
}

runRepl();
