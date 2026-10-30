import { ToolError } from '../errors.js'

import { extensionForMimeType, isHttpUrl, parseBase64DataUri } from './base64.js'
import { GptImageApiError } from './client.js'
import type { GptImageConfig } from './config.js'
import { detectImageMimeType, MAX_IMAGE_BYTES, type ImageInputFile, type ImageIO } from './files.js'

export interface ResolveImageInputOptions {
  readonly value: string
  readonly config: GptImageConfig
  readonly imageIO?: ImageIO
  readonly label: string
  readonly fallbackFilename: string
}

/**
 * 将统一图片输入解析为字节与 MIME：
 * - `data:` → 本地解码；
 * - `http(s)://` → 下载（不携带上游 API Key，避免泄漏给第三方存储）；
 * - 其他 → 通过注入的 `ImageIO` 读取本地文件。
 */
export async function resolveImageInput(
  options: ResolveImageInputOptions,
): Promise<ImageInputFile> {
  const value = options.value.trim()

  if (value.length === 0) {
    throw new ToolError(`${options.label} 不能为空。`)
  }

  const dataUri = parseBase64DataUri(value)
  if (dataUri !== undefined) {
    return {
      bytes: dataUri.bytes,
      mimeType: dataUri.mimeType,
      filename: withExtension(options.fallbackFilename, dataUri.mimeType),
    }
  }

  if (isHttpUrl(value)) {
    return await downloadImage(value, options)
  }

  if (options.imageIO === undefined) {
    throw new ToolError('当前运行时不支持读取本地文件，请改用 http(s) URL 或 base64 data URI。')
  }

  const file = await options.imageIO.readFile(value)

  return {
    bytes: file.bytes,
    mimeType: file.mimeType,
    filename: file.filename ?? options.fallbackFilename,
  }
}

async function downloadImage(
  url: string,
  options: ResolveImageInputOptions,
): Promise<ImageInputFile> {
  let response: Response

  try {
    response = await fetch(url, {
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(options.config.timeoutMs),
    })
  } catch (error) {
    throw new ToolError(
      `${options.label} 下载失败：${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!response.ok) {
    throw new GptImageApiError(
      `${options.label} 下载失败：HTTP ${String(response.status)}。`,
      response.status,
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await response.arrayBuffer()
  } catch (error) {
    throw new ToolError(
      `${options.label} 下载失败：${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ToolError(`${options.label} 超过 50MB 限制。`)
  }

  const bytes = new Uint8Array(buffer)
  const header = response.headers.get('content-type')
  const contentType = header === null ? undefined : header.split(';')[0].trim()
  const mimeType =
    contentType?.startsWith('image/') === true
      ? contentType
      : (detectImageMimeType(bytes) ?? 'application/octet-stream')

  return {
    bytes,
    mimeType,
    filename: filenameFromUrl(url, mimeType),
  }
}

function filenameFromUrl(url: string, mimeType: string): string {
  try {
    const pathname = new URL(url).pathname
    const name = pathname.split('/').pop() ?? ''

    if (name.length > 0) {
      return withExtension(decodeURIComponent(name), mimeType)
    }
  } catch {
    // URL 解析或解码失败时使用兜底文件名。
  }

  return `image${extensionForMimeType(mimeType)}`
}

function withExtension(filename: string, mimeType: string): string {
  return /\.[a-z0-9]+$/iu.test(filename) ? filename : `${filename}${extensionForMimeType(mimeType)}`
}
