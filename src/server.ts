import { McpServer } from '@modelcontextprotocol/server'

import { readProcessEnv, resolveServerConfig, type ServerConfig } from './gpt-image/config.js'
import { registerImageTools } from './tools/images.js'
import { registerResponsesTools } from './tools/responses.js'
import { SERVER_NAME, SERVER_VERSION } from './version.js'

const INSTRUCTIONS = `本服务器提供 GPT Image 图像生成与编辑工具：
- generate_image：通过 Images API（/v1/images/generations）生成图片。
- edit_image：通过 Images API（/v1/images/edits）编辑图片，支持单图、多图和 mask。
- generate_image_via_responses：通过 Responses API 的 image_generation 工具生成图片，支持 previous_response_id 多轮编辑。

使用前提：
- 配置 GPT_IMAGE_API_KEY，或回退使用 OPENAI_API_KEY。
- 可选配置 GPT_IMAGE_BASE_URL 指向 OpenAI 兼容中转站，服务会自动补 /v1。
- output_path 仅在 Node 运行时可用；Cloudflare Workers 请省略 output_path 以返回内联图片。
- 调用前可使用 tools/list 查看完整参数。`

/**
 * 创建一个 MCP Server 实例。
 *
 * SDK 的 `McpServerFactory` 会把 `McpRequestContext` 作为第一个参数传入，
 * 因此入口必须使用 `() => createServer(config)` 包一层，不能直接传入本函数。
 */
export function createServer(config: ServerConfig = defaultServerConfig()): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    { instructions: INSTRUCTIONS },
  )

  registerImageTools(server, config)
  registerResponsesTools(server, config)

  return server
}

function defaultServerConfig(): ServerConfig {
  return resolveServerConfig(readProcessEnv())
}
