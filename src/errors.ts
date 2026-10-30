/** 将未知异常转为可读消息，避免各处重复 `instanceof Error` 判断。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 可安全呈现给 MCP 客户端的业务错误；工具层不为其记录服务端日志。 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}
