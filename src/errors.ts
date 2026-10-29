/** 可安全呈现给 MCP 客户端的业务错误；工具层不为其记录服务端日志。 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}
