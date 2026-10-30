import type { ZodType } from 'zod'

import { GptImageApiError } from './client.js'
import type { GptImageConfig } from './config.js'

const MAX_ERROR_LENGTH = 500

/** 发送 JSON 请求并校验响应结构。 */
export async function requestJson<T>(
  config: GptImageConfig,
  path: string,
  body: unknown,
  schema: ZodType<T>,
  timeoutMs: number,
): Promise<T> {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  })
  applyAuth(headers, config.apiKey)

  return await execute(config, path, { headers, body: JSON.stringify(body) }, schema, timeoutMs)
}

/** 发送 multipart 请求；不要手动设置 Content-Type，由 fetch 生成 boundary。 */
export async function requestMultipart<T>(
  config: GptImageConfig,
  path: string,
  form: FormData,
  schema: ZodType<T>,
  timeoutMs: number,
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' })
  applyAuth(headers, config.apiKey)

  return await execute(config, path, { headers, body: form }, schema, timeoutMs)
}

interface RequestInitLike {
  readonly headers: Headers
  readonly body: string | FormData
}

async function execute<T>(
  config: GptImageConfig,
  path: string,
  init: RequestInitLike,
  schema: ZodType<T>,
  timeoutMs: number,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw createTransportError(error, config.apiKey, timeoutMs)
  }

  if (!response.ok) {
    throw await createApiError(response, config.apiKey)
  }

  let text: string
  try {
    text = await response.text()
  } catch (error) {
    throw createTransportError(error, config.apiKey, timeoutMs)
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new GptImageApiError(
      `GPT Image 接口返回了非 JSON 响应（HTTP ${String(response.status)}）。`,
      502,
    )
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    const detail = parsed.error.issues.length > 0 ? parsed.error.issues[0].message : '结构校验失败'
    throw new GptImageApiError(`GPT Image 接口响应结构不符合预期：${detail}`, 502)
  }

  return parsed.data
}

function applyAuth(headers: Headers, apiKey: string | undefined): void {
  if (apiKey !== undefined && apiKey.length > 0) {
    headers.set('Authorization', `Bearer ${apiKey}`)
  }
}

function createTransportError(
  error: unknown,
  apiKey: string | undefined,
  timeoutMs: number,
): GptImageApiError {
  if (isAbortError(error)) {
    return new GptImageApiError(
      `请求超时（${String(timeoutMs)} 毫秒）。图片可能仍在上游生成，请勿立即重试以免重复计费。`,
      408,
    )
  }

  return new GptImageApiError(`无法连接 GPT Image 服务：${redact(errorText(error), apiKey)}`, 0)
}

async function createApiError(
  response: Response,
  apiKey: string | undefined,
): Promise<GptImageApiError> {
  let detail = ''

  try {
    const text = await response.text()
    if (text.length > 0) {
      detail = redact(extractErrorMessage(text), apiKey)
    }
  } catch {
    // 错误体读取失败时保留状态码信息。
  }

  const retryAfter = response.headers.get('retry-after')
  const retryHint =
    response.status === 429 && retryAfter !== null ? `（建议 ${retryAfter} 秒后重试）` : ''
  const detailPart = detail.length > 0 ? `：${truncate(detail)}` : ''

  return new GptImageApiError(
    `GPT Image 接口返回 HTTP ${String(response.status)}${detailPart}${retryHint}`,
    response.status,
  )
}

function extractErrorMessage(text: string): string {
  try {
    const json: unknown = JSON.parse(text)
    if (isRecord(json)) {
      if (typeof json.message === 'string' && json.message.length > 0) {
        return json.message
      }

      const error = json.error
      if (isRecord(error) && typeof error.message === 'string' && error.message.length > 0) {
        return error.message
      }

      if (typeof error === 'string' && error.length > 0) {
        return error
      }
    }
  } catch {
    // 非 JSON 错误体直接使用原文。
  }

  return text
}

function redact(message: string, apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey.length < 4) {
    return message
  }

  return message.split(apiKey).join('***')
}

function truncate(message: string): string {
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}…` : message
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}
