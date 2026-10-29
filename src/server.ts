import { McpServer } from '@modelcontextprotocol/server'

import { registerEchoTools } from './tools/echo.js'
import { SERVER_NAME, SERVER_VERSION } from './version.js'

const INSTRUCTIONS = `本服务器提供 GPT Image 相关的 MCP 工具。
- 当前版本仅提供 echo 示例工具，用于验证客户端连接与工具调用链路。
- 调用前请使用 tools/list 查看当前可用工具；gpt-image 领域工具将在后续版本加入。`

/**
 * 创建一个 MCP Server 实例。
 *
 * SDK 的 `McpServerFactory` 会把 `McpRequestContext` 作为第一个参数传入，
 * 因此这里刻意保持零参数，避免上下文被误认为配置项。
 */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    { instructions: INSTRUCTIONS },
  )

  registerEchoTools(server)

  return server
}
