#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio'

import { parseCliOptions } from './config.js'
import { resolveServerConfig, type ServerConfig } from './gpt-image/config.js'
import { createNodeImageIO } from './node-files.js'
import { createServer } from './server.js'
import { SERVER_NAME, SERVER_VERSION } from './version.js'

const HELP_TEXT = `用法：${SERVER_NAME} [选项]

选项：
  --transport <stdio|http>  传输方式（默认：stdio）
  --host <host>             HTTP 监听地址（默认：127.0.0.1）
  --port <port>             HTTP 监听端口（默认：3000）
  --path <path>             MCP 端点路径（默认：/mcp）
  -h, --help                显示帮助
  -v, --version             显示版本

MCP 环境变量：
  MCP_TRANSPORT             stdio | http
  MCP_HOST                  HTTP 监听地址
  MCP_PORT                  HTTP 监听端口
  MCP_PATH                  MCP 端点路径
  MCP_ALLOWED_HOSTS         允许的 Host 主机名，逗号分隔
  MCP_ALLOWED_ORIGINS       允许的 Origin 主机名，逗号分隔
  MCP_API_KEY               入站鉴权 key，逗号分隔支持多 key

GPT Image 环境变量：
  GPT_IMAGE_BASE_URL        OpenAI 兼容端点（默认 https://api.openai.com，自动补 /v1）
  GPT_IMAGE_API_KEY         上游 API Key（回退 OPENAI_API_KEY；空字符串表示不发送）
  GPT_IMAGE_MODEL           生成默认模型（默认 gpt-image-2.5-flare）
  GPT_IMAGE_EDIT_MODEL      编辑默认模型（默认 gpt-image-2.5-sunburst）
  GPT_IMAGE_RESPONSE_MODEL  Responses 顶层文本模型（默认 gpt-6-astra）
  GPT_IMAGE_TIMEOUT_MS      Images 请求超时（默认 120000）
  GPT_IMAGE_RESPONSES_TIMEOUT_MS  Responses 请求超时（默认 300000）
  GPT_IMAGE_OUTPUT_ROOT     限制 output_path 的可写根目录
  GPT_IMAGE_MULTI_IMAGE_FIELD     多图编辑字段名（默认 image[]）
  GPT_IMAGE_RESPONSE_FORMAT       附加 response_format（url | b64_json）`

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2), process.env)

  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`)
    return
  }

  if (options.version) {
    process.stdout.write(`${SERVER_VERSION}\n`)
    return
  }

  const serverConfig = createServerConfig()

  if (options.transport === 'stdio') {
    const handle = serveStdio(() => createServer(serverConfig))
    console.error(`${SERVER_NAME} ${SERVER_VERSION} 已启动（stdio）`)

    const shutdown = (): void => {
      void handle.close()
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    return
  }

  const { startHttpServer } = await import('./node.js')
  startHttpServer(options, serverConfig)
}

function createServerConfig(): ServerConfig {
  return resolveServerConfig(
    process.env,
    createNodeImageIO({ outputRoot: process.env.GPT_IMAGE_OUTPUT_ROOT }),
  )
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
