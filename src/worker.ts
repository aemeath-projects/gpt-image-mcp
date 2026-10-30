import { parseList } from './env.js'
import { resolveServerConfig } from './gpt-image/config.js'
import { createFetchHandler, type FetchHandler } from './http.js'

export interface Env {
  ALLOWED_HOSTS?: string
  ALLOWED_ORIGINS?: string
  MCP_API_KEY?: string
  GPT_IMAGE_BASE_URL?: string
  GPT_IMAGE_API_KEY?: string
  OPENAI_API_KEY?: string
  GPT_IMAGE_MODEL?: string
  GPT_IMAGE_EDIT_MODEL?: string
  GPT_IMAGE_RESPONSE_MODEL?: string
  GPT_IMAGE_TIMEOUT_MS?: string
  GPT_IMAGE_RESPONSES_TIMEOUT_MS?: string
  GPT_IMAGE_OUTPUT_ROOT?: string
  GPT_IMAGE_MULTI_IMAGE_FIELD?: string
  GPT_IMAGE_RESPONSE_FORMAT?: string
}

export function createWorkerHandler(env: Env): FetchHandler {
  return createFetchHandler({
    allowedHosts: parseList(env.ALLOWED_HOSTS),
    allowedOrigins: parseList(env.ALLOWED_ORIGINS),
    apiKeys: parseList(env.MCP_API_KEY),
    // Worker 不注入 ImageIO：output_path 与本地图片路径会在请求上游前报错。
    serverConfig: resolveServerConfig({ ...env }),
  })
}

let cachedHandler: FetchHandler | undefined

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    cachedHandler ??= createWorkerHandler(env)
    return cachedHandler.fetch(request)
  },
}
