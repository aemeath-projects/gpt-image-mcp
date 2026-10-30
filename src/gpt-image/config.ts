import { ToolError } from '../errors.js'

import type { ImageIO } from './files.js'

export type ResponseFormat = 'url' | 'b64_json'
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

export interface GptImageConfig {
  readonly baseUrl: string
  /** `undefined` 表示未配置；空字符串表示显式不发送 Authorization。 */
  readonly apiKey?: string
  readonly defaultModel: string
  readonly editModel: string
  readonly responsesModel: string
  /** Responses 文本模型的推理强度；`undefined` 表示不发送 `reasoning`。 */
  readonly reasoningEffort?: ReasoningEffort
  readonly timeoutMs: number
  readonly responsesTimeoutMs: number
  readonly outputRoot?: string
  readonly multiImageField: string
  readonly responseFormat?: ResponseFormat
}

export interface ServerConfig {
  readonly gptImage: GptImageConfig
  readonly imageIO?: ImageIO
}

const DEFAULT_BASE_URL = 'https://api.openai.com'
const DEFAULT_MODEL = 'gpt-image-2.5-flare'
const DEFAULT_EDIT_MODEL = 'gpt-image-2.5-sunburst'
const DEFAULT_RESPONSES_MODEL = 'gpt-6-astra'
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high'
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_RESPONSES_TIMEOUT_MS = 300_000
const DEFAULT_MULTI_IMAGE_FIELD = 'image[]'

export function resolveGptImageConfig(
  env: Readonly<Record<string, string | undefined>>,
): GptImageConfig {
  const responseFormatRaw = optionalString(env.GPT_IMAGE_RESPONSE_FORMAT)
  let responseFormat: ResponseFormat | undefined

  if (responseFormatRaw !== undefined) {
    if (responseFormatRaw !== 'url' && responseFormatRaw !== 'b64_json') {
      throw new ToolError(
        `GPT_IMAGE_RESPONSE_FORMAT 只能是 "url" 或 "b64_json"，收到 "${responseFormatRaw}"。`,
      )
    }
    responseFormat = responseFormatRaw
  }

  const outputRoot = optionalString(env.GPT_IMAGE_OUTPUT_ROOT)
  const reasoningEffort = parseReasoningEffort(env.GPT_IMAGE_REASONING_EFFORT)
  const config: GptImageConfig = {
    baseUrl: normalizeBaseUrl(env.GPT_IMAGE_BASE_URL ?? DEFAULT_BASE_URL),
    defaultModel: optionalString(env.GPT_IMAGE_MODEL) ?? DEFAULT_MODEL,
    editModel: optionalString(env.GPT_IMAGE_EDIT_MODEL) ?? DEFAULT_EDIT_MODEL,
    responsesModel: optionalString(env.GPT_IMAGE_RESPONSE_MODEL) ?? DEFAULT_RESPONSES_MODEL,
    timeoutMs: parseTimeout(env.GPT_IMAGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'GPT_IMAGE_TIMEOUT_MS'),
    responsesTimeoutMs: parseTimeout(
      env.GPT_IMAGE_RESPONSES_TIMEOUT_MS,
      DEFAULT_RESPONSES_TIMEOUT_MS,
      'GPT_IMAGE_RESPONSES_TIMEOUT_MS',
    ),
    multiImageField: optionalString(env.GPT_IMAGE_MULTI_IMAGE_FIELD) ?? DEFAULT_MULTI_IMAGE_FIELD,
  }

  const rawApiKey = env.GPT_IMAGE_API_KEY ?? env.OPENAI_API_KEY
  const apiKey = rawApiKey === undefined ? undefined : rawApiKey.trim()
  const withOptional: GptImageConfig = {
    ...config,
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(outputRoot === undefined ? {} : { outputRoot }),
    ...(responseFormat === undefined ? {} : { responseFormat }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }

  return withOptional
}

/** 在共享层安全读取进程环境变量；Cloudflare Workers 中 `process` 可能不存在。 */
export function readProcessEnv(): Record<string, string | undefined> {
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }

  return runtime.process?.env ?? {}
}

export function resolveServerConfig(
  env: Readonly<Record<string, string | undefined>>,
  imageIO?: ImageIO,
): ServerConfig {
  const gptImage = resolveGptImageConfig(env)

  return imageIO === undefined ? { gptImage } : { gptImage, imageIO }
}

/** 归一化端点：去掉末尾斜杠；路径为空时补 `/v1`；拒绝带账号密码的 URL。 */
export function normalizeBaseUrl(raw: string): string {
  let url: URL

  try {
    url = new URL(raw.trim())
  } catch {
    throw new ToolError(`无效的 GPT_IMAGE_BASE_URL："${raw}"。`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ToolError('GPT_IMAGE_BASE_URL 只支持 http 或 https 协议。')
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new ToolError('GPT_IMAGE_BASE_URL 不能包含用户名或密码。')
  }

  const pathname = url.pathname.replace(/\/+$/u, '')
  url.pathname = pathname === '' ? '/v1' : pathname
  url.hash = ''

  const normalized = url.toString()
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function optionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseReasoningEffort(value: string | undefined): ReasoningEffort | undefined {
  if (value === undefined) {
    return DEFAULT_REASONING_EFFORT
  }

  const normalized = value.trim().toLowerCase()

  // 空字符串、none、off 都表示显式不发送 reasoning 字段。
  if (normalized === '' || normalized === 'none' || normalized === 'off') {
    return undefined
  }

  if (
    normalized === 'minimal' ||
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high'
  ) {
    return normalized
  }

  throw new ToolError(
    `GPT_IMAGE_REASONING_EFFORT 只能是 minimal、low、medium、high，或设为 none 禁用，收到 "${value}"。`,
  )
}

function parseTimeout(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 900_000) {
    throw new ToolError(`${name} 必须是 1000-900000 之间的整数。`)
  }

  return parsed
}
