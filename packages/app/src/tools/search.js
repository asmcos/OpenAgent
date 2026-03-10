/**
 * grep / find 类操作（OpenCode 风格）：按内容搜索、按文件名/模式查找
 */
import { tool } from 'ai';
import { z } from 'zod';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

const cwd = () => process.cwd();

function resolvePath(relativePath) {
  const base = resolve(cwd());
  const full = resolve(base, relativePath);
  if (!full.startsWith(base)) throw new Error('路径不允许超出当前工作目录');
  return full;
}

/** 简单 glob：仅支持 * 表示任意字符 */
function matchGlob(name, pattern) {
  if (!pattern.includes('*')) return name.includes(pattern);
  const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return re.test(name);
}

export const grepTool = tool({
  description: '在文件中按内容搜索（类似 grep）。在指定目录下递归查找包含某段文本或正则的文件，并返回匹配行。',
  parameters: z.object({
    dir: z.string().describe('要搜索的根目录路径'),
    pattern: z.string().describe('要搜索的文本或正则表达式'),
    filePattern: z.string().optional().describe('文件名过滤，如 *.js 只搜 js 文件'),
    maxFiles: z.number().optional().default(50).describe('最多检查文件数'),
    maxMatches: z.number().optional().default(100).describe('最多返回匹配行数'),
  }),
  execute: async ({ dir, pattern, filePattern, maxFiles, maxMatches }) => {
    const root = resolvePath(dir);
    const results = [];
    let filesChecked = 0;
    const maxBytes = 500000;

    const scan = async (currentDir, depth) => {
      if (depth > 10 || filesChecked >= maxFiles || results.length >= maxMatches) return;
      const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (filesChecked >= maxFiles || results.length >= maxMatches) break;
        const full = join(currentDir, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && e.name !== 'node_modules') await scan(full, depth + 1);
          continue;
        }
        if (filePattern && !matchGlob(e.name, filePattern)) continue;
        filesChecked += 1;
        try {
          const buf = await readFile(full);
          if (buf.length > maxBytes) continue;
          const text = buf.toString('utf8');
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
            const re = new RegExp(pattern, 'gi');
            if (re.test(lines[i])) {
              results.push({ path: full, line: i + 1, content: lines[i].trim().slice(0, 200) });
            }
          }
        } catch (_) {}
      }
    };
    try {
      await scan(root, 0);
      return { dir: root, pattern, matches: results, count: results.length };
    } catch (err) {
      return { error: err.message, dir: root };
    }
  },
});

export const findTool = tool({
  description: '按文件名模式查找文件（类似 find）。在指定目录下递归查找文件名匹配 pattern 的文件。pattern 支持 * 通配，如 *.js、*test*。',
  parameters: z.object({
    dir: z.string().describe('要搜索的根目录路径'),
    pattern: z.string().describe('文件名匹配模式，支持 * 通配'),
    maxDepth: z.number().optional().default(5).describe('最大递归深度'),
    maxResults: z.number().optional().default(100).describe('最多返回条数'),
  }),
  execute: async ({ dir, pattern, maxDepth, maxResults }) => {
    const root = resolvePath(dir);
    const results = [];

    const scan = async (currentDir, depth) => {
      if (depth > maxDepth || results.length >= maxResults) return;
      const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (results.length >= maxResults) break;
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && e.name !== 'node_modules')
            await scan(join(currentDir, e.name), depth + 1);
          continue;
        }
        if (matchGlob(e.name, pattern)) results.push(join(currentDir, e.name));
      }
    };
    try {
      await scan(root, 0);
      return { dir: root, pattern, files: results, count: results.length };
    } catch (err) {
      return { error: err.message, dir: root };
    }
  },
});

export const searchTools = {
  grep: grepTool,
  find: findTool,
};
