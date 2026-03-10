/**
 * 文件读写与增删：读、写、追加、删除（OpenCode 风格常规操作）
 * 路径限制在当前工作目录内
 */
import { tool } from 'ai';
import { z } from 'zod';
import { readFile, writeFile, appendFile, rm, stat } from 'fs/promises';
import { join, resolve } from 'path';

const cwd = () => process.cwd();

function resolvePath(relativePath) {
  const base = resolve(cwd());
  const full = resolve(base, relativePath);
  if (!full.startsWith(base)) throw new Error('路径不允许超出当前工作目录');
  return full;
}

export const readFileTool = tool({
  description: '读取文件内容。用于查看某文件的完整或部分内容。',
  parameters: z.object({
    path: z.string().describe('文件路径，相对当前工作目录或绝对路径'),
    encoding: z.enum(['utf8', 'base64']).optional().default('utf8').describe('编码'),
    maxBytes: z.number().optional().default(100000).describe('最多读取字节数，避免大文件'),
  }),
  execute: async ({ path: p, encoding, maxBytes }) => {
    const full = resolvePath(p);
    try {
      const buf = await readFile(full);
      const s = await stat(full);
      if (!s.isFile()) return { error: '不是文件', path: full };
      const content = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
      const text = encoding === 'utf8' ? content.toString('utf8') : content.toString('base64');
      return { path: full, content: text, truncated: buf.length > maxBytes, bytes: buf.length };
    } catch (err) {
      return { error: err.message, path: full };
    }
  },
});

export const writeFileTool = tool({
  description: '写入文件（新建或覆盖）。用于创建新文件或完整覆盖已有文件内容。',
  parameters: z.object({
    path: z.string().describe('文件路径'),
    content: z.string().describe('要写入的文本内容'),
  }),
  execute: async ({ path: p, content }) => {
    const full = resolvePath(p);
    try {
      await writeFile(full, content, 'utf8');
      return { path: full, written: true };
    } catch (err) {
      return { error: err.message, path: full };
    }
  },
});

export const appendFileTool = tool({
  description: '向文件末尾追加内容。不覆盖原有内容。',
  parameters: z.object({
    path: z.string().describe('文件路径'),
    content: z.string().describe('要追加的文本内容'),
  }),
  execute: async ({ path: p, content }) => {
    const full = resolvePath(p);
    try {
      await appendFile(full, content, 'utf8');
      return { path: full, appended: true };
    } catch (err) {
      return { error: err.message, path: full };
    }
  },
});

export const deleteFileTool = tool({
  description: '删除文件或空目录。',
  parameters: z.object({
    path: z.string().describe('文件或空目录路径'),
  }),
  execute: async ({ path: p }) => {
    const full = resolvePath(p);
    try {
      const s = await stat(full).catch(() => null);
      if (!s) return { error: '文件或目录不存在', path: full };
      await rm(full, { recursive: s.isDirectory(), force: true });
      return { path: full, deleted: true };
    } catch (err) {
      return { error: err.message, path: full };
    }
  },
});

export const fileOpsTools = {
  read_file: readFileTool,
  write_file: writeFileTool,
  append_file: appendFileTool,
  delete_file: deleteFileTool,
};
