/**
 * 内置文件类工具：列出目录、按关键词搜索（可被 app 动态注册）
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { readdir } from 'fs/promises';
import { join } from 'path';

const cwd = () => process.cwd();

export const listFiles = new DynamicStructuredTool({
  name: 'list_files',
  description: '列出指定目录下的文件和子目录。用于查看某个路径里有什么文件。',
  schema: z.object({
    dir: z.string().describe('目录路径，相对当前工作目录或绝对路径'),
    maxEntries: z.number().optional().nullable().default(20).describe('最多返回条目数'),
  }),
  func: async ({ dir, maxEntries }) => {
    const fullPath = dir.startsWith('/') ? dir : join(cwd(), dir);
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      const list = entries.slice(0, maxEntries).map((e) =>
        e.isDirectory() ? `[DIR]  ${e.name}` : `[FILE] ${e.name}`
      );
      const more = entries.length > maxEntries ? `... 共 ${entries.length} 项，仅显示前 ${maxEntries} 项` : '';
      return JSON.stringify({ path: fullPath, entries: list, more });
    } catch (err) {
      return JSON.stringify({ error: err.message, path: fullPath });
    }
  },
});

export const searchFiles = new DynamicStructuredTool({
  name: 'search_files',
  description: '在指定目录下按文件名关键词搜索文件或目录（简单包含匹配）。',
  schema: z.object({
    dir: z.string().describe('要搜索的目录路径'),
    keyword: z.string().describe('文件名包含的关键词'),
    maxEntries: z.number().optional().nullable().default(30).describe('最多返回条目数'),
  }),
  func: async ({ dir, keyword, maxEntries }) => {
    const fullPath = dir.startsWith('/') ? dir : join(cwd(), dir);
    const lowerKeyword = keyword.toLowerCase();
    const results = [];
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
    try {
      await collect(fullPath, 0);
      return JSON.stringify({ path: fullPath, keyword, results, count: results.length });
    } catch (err) {
      return JSON.stringify({ error: err.message, path: fullPath });
    }
  },
});

export const fileTools = {
  list_files: listFiles,
  search_files: searchFiles,
};
