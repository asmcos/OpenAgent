/**
 * 工具注册表：支持动态注册 / 注销，供 Agent 在运行时使用
 */
export class ToolRegistry {
  constructor() {
    /** @type {Map<string, import('ai').CoreTool>} */
    this._tools = new Map();
  }

  /**
   * 注册一个工具
   * @param {string} name - 工具名（用于模型调用，建议 snake_case）
   * @param {import('ai').CoreTool} tool - AI SDK tool 对象（如 tool({ description, parameters, execute })）
   */
  register(name, tool) {
    if (this._tools.has(name)) {
      console.warn(`[ToolRegistry] 覆盖已存在的工具: ${name}`);
    }
    this._tools.set(name, tool);
    return this;
  }

  /**
   * 注销工具
   * @param {string} name
   */
  unregister(name) {
    this._tools.delete(name);
    return this;
  }

  /**
   * 批量注册
   * @param {Record<string, import('ai').CoreTool>} tools - 名称 -> tool 对象
   */
  registerAll(tools) {
    for (const [name, t] of Object.entries(tools)) {
      this.register(name, t);
    }
    return this;
  }

  /**
   * 返回当前所有工具（AI SDK generateText 的 tools 参数格式）
   * @returns {Record<string, import('ai').CoreTool>}
   */
  getTools() {
    return Object.fromEntries(this._tools);
  }

  /**
   * 工具名称列表
   * @returns {string[]}
   */
  listNames() {
    return Array.from(this._tools.keys());
  }

  /**
   * 是否已注册某工具
   * @param {string} name
   */
  has(name) {
    return this._tools.has(name);
  }

  /** 已注册数量 */
  get size() {
    return this._tools.size;
  }
}
