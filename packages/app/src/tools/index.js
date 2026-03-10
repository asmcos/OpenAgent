/**
 * 默认工具集合：汇总 app/src/tools 下所有工具，供应用与 example 一次性注册
 * OpenCode 风格：列表、查文件、读写删、grep、find
 */
import { fileTools } from './files.js';
import { fileOpsTools } from './fileOps.js';
import { searchTools } from './search.js';

export const defaultTools = {
  ...fileTools,
  ...fileOpsTools,
  ...searchTools,
};

export { fileTools } from './files.js';
export { fileOpsTools } from './fileOps.js';
export { searchTools } from './search.js';
