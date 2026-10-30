import { ToolError } from '../errors.js'

import type { ImageOutputFormat } from './models.js'

const CHUNK_SIZE = 0x8000
const DATA_URI_PATTERN = /^data:([^;,]+);base64,(.*)$/su

export interface Base64DataUri {
  readonly mimeType: string
  readonly bytes: Uint8Array
}

/** 分块编码，避免大图触发 `String.fromCharCode` 的参数上限。 */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + CHUNK_SIZE)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export function decodeBase64(value: string): Uint8Array {
  let binary: string

  try {
    binary = atob(value)
  } catch {
    throw new ToolError('无法解码 base64 图片数据，请确认输入为有效的 base64 字符串。')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

export function bytesToDataUri(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${encodeBase64(bytes)}`
}

/** 非 data URI 返回 `undefined`；以 `data:` 开头但格式不支持时抛错。 */
export function parseBase64DataUri(value: string): Base64DataUri | undefined {
  if (!value.startsWith('data:')) {
    return undefined
  }

  const match = DATA_URI_PATTERN.exec(value)
  if (match === null) {
    throw new ToolError('仅支持 base64 编码的 data URI 图片。')
  }

  return {
    mimeType: match[1],
    bytes: decodeBase64(match[2]),
  }
}

export function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

export function mimeTypeForFormat(format: ImageOutputFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

export function extensionForFormat(format: ImageOutputFormat): string {
  return format === 'jpeg' ? '.jpeg' : `.${format}`
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    default:
      return '.png'
  }
}

/** 仅用于结构化摘要，不参与解码。 */
export function estimateBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0

  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}
