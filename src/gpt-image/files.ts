import type { ImageOutputFormat } from './models.js'

export interface ImageInputFile {
  readonly bytes: Uint8Array
  readonly mimeType: string
  readonly filename?: string
}

export interface ImageWriteItem {
  readonly bytes: Uint8Array
  readonly index: number
}

export interface WriteImagesOptions {
  readonly outputPath: string
  readonly format: ImageOutputFormat
  readonly images: readonly ImageWriteItem[]
  readonly overwrite: boolean
}

/**
 * 运行时文件能力。
 *
 * 共享层与 Worker 只依赖该接口；Node 实现由 `cli.ts` 注入，
 * 未注入时工具会在请求上游之前给出明确错误。
 */
export interface ImageIO {
  readFile(path: string): Promise<ImageInputFile>
  /** 返回与实际写入顺序一致的绝对路径。 */
  writeImages(options: WriteImagesOptions): Promise<string[]>
}

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024

/** 通过魔数识别常见图片格式，避免仅依赖文件扩展名或 Content-Type。 */
export function detectImageMimeType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }

  return undefined
}
