import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  type McpHttpHandler,
} from '@modelcontextprotocol/server'

import { checkApiKeys, unauthorizedResponse } from './auth.js'
import type { ServerConfig } from './gpt-image/config.js'
import { createServer } from './server.js'

export interface FetchHandlerOptions {
  /** MCP 端点路径，必须以 `/` 开头。 */
  path?: string
  /** 允许的 Host 主机名（不含端口）；未配置时跳过校验。 */
  allowedHosts?: string[]
  /** 允许的 Origin 主机名；未配置时跳过校验。 */
  allowedOrigins?: string[]
  /** 入站鉴权 key；未配置或为空时不校验。 */
  apiKeys?: string[]
  /** 工具运行配置；未提供时由 `createServer` 从进程环境变量解析。 */
  serverConfig?: ServerConfig
}

/**
 * 与 SDK 的 `McpHttpHandler` 对齐，保留 `notify` / `bus`，以便后续启用
 * `subscriptions/listen` 服务端推送能力。
 */
export type FetchHandler = Pick<McpHttpHandler, 'fetch' | 'close' | 'notify' | 'bus'>

const DEFAULT_PATH = '/mcp'

/**
 * 创建 web-standard 的 MCP 请求处理器，可同时用于 Node 与 Cloudflare Workers。
 *
 * Host/Origin 校验与入站鉴权在此统一完成，Node 与 Worker 两侧不重复实现。
 */
export function createFetchHandler(options: FetchHandlerOptions = {}): FetchHandler {
  const path = options.path ?? DEFAULT_PATH
  const { allowedHosts, allowedOrigins, apiKeys, serverConfig } = options
  const mcpHandler = createMcpHandler(() => createServer(serverConfig))

  return {
    async fetch(request, requestOptions) {
      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/health') {
        return Response.json({ status: 'ok' })
      }

      if (url.pathname !== path) {
        return new Response('Not Found', { status: 404 })
      }

      if (allowedHosts !== undefined && allowedHosts.length > 0) {
        const rejection = hostHeaderValidationResponse(request, allowedHosts)
        if (rejection !== undefined) {
          return rejection
        }
      }

      if (allowedOrigins !== undefined && allowedOrigins.length > 0) {
        const rejection = originValidationResponse(request, allowedOrigins)
        if (rejection !== undefined) {
          return rejection
        }
      }

      if (apiKeys !== undefined && apiKeys.length > 0 && !checkApiKeys(request, apiKeys)) {
        return unauthorizedResponse()
      }

      return mcpHandler.fetch(request, requestOptions)
    },
    close: () => mcpHandler.close(),
    notify: mcpHandler.notify,
    bus: mcpHandler.bus,
  }
}
