import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { errorMessage, ToolError } from './errors.js'
import { extensionForFormat } from './gpt-image/base64.js'
import {
  detectImageMimeType,
  MAX_IMAGE_BYTES,
  type ImageInputFile,
  type ImageIO,
  type WriteImagesOptions,
} from './gpt-image/files.js'
import type { ImageOutputFormat } from './gpt-image/models.js'

export interface NodeImageIOOptions {
  /** 设置后所有输出路径必须落在该目录内。 */
  readonly outputRoot?: string
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** Node 运行时文件能力；仅由 `cli.ts` 注入，不进入 Worker bundle。 */
export function createNodeImageIO(options: NodeImageIOOptions = {}): ImageIO {
  const outputRoot = options.outputRoot === undefined ? undefined : resolve(options.outputRoot)

  return {
    async readFile(path: string): Promise<ImageInputFile> {
      const absolute = resolve(path)
      const stats = await stat(absolute).catch(() => undefined)

      if (stats === undefined) {
        throw new ToolError(`无法读取图片文件：${path}。`)
      }

      if (!stats.isFile()) {
        throw new ToolError(`输入路径不是文件：${path}。`)
      }

      if (stats.size > MAX_IMAGE_BYTES) {
        throw new ToolError(`图片文件超过 50MB 限制：${path}。`)
      }

      let bytes: Uint8Array
      try {
        bytes = await readFile(absolute)
      } catch (error) {
        throw new ToolError(`读取图片文件失败：${errorMessage(error)}`)
      }

      return {
        bytes,
        mimeType: detectImageMimeType(bytes) ?? mimeTypeFromExtension(absolute),
        filename: basename(absolute),
      }
    },

    async writeImages(writeOptions: WriteImagesOptions): Promise<string[]> {
      const directory = await isDirectoryTarget(writeOptions.outputPath)
      const targets = planOutputPaths(
        writeOptions.outputPath,
        directory,
        writeOptions.format,
        writeOptions.images.length,
        outputRoot,
      )

      if (targets.length === 0) {
        throw new ToolError('没有需要写入的图片。')
      }

      // 先整体预检，避免只写入一部分目标。
      for (const target of targets) {
        if (!writeOptions.overwrite && (await pathExists(target))) {
          throw new ToolError(`输出文件已存在：${target}（如需覆盖请传 overwrite=true）。`)
        }
      }

      const directories = new Set(targets.map((target) => dirname(target)))
      for (const directoryPath of directories) {
        try {
          await mkdir(directoryPath, { recursive: true })
        } catch (error) {
          throw new ToolError(`创建输出目录失败：${errorMessage(error)}`)
        }
      }

      const ordered = [...writeOptions.images].sort((left, right) => left.index - right.index)

      for (const [position, item] of ordered.entries()) {
        const target = targets[position]

        try {
          await writeFile(target, item.bytes, {
            flag: writeOptions.overwrite ? 'w' : 'wx',
          })
        } catch (error) {
          throw new ToolError(`写入图片失败：${target}：${errorMessage(error)}`)
        }
      }

      return targets
    },
  }
}

async function isDirectoryTarget(outputPath: string): Promise<boolean> {
  if (/[\\/]$/u.test(outputPath)) {
    return true
  }

  const stats = await stat(resolve(outputPath)).catch(() => undefined)

  return stats?.isDirectory() ?? false
}

async function pathExists(path: string): Promise<boolean> {
  const stats = await stat(path).catch(() => undefined)

  return stats !== undefined
}

function planOutputPaths(
  outputPath: string,
  directory: boolean,
  format: ImageOutputFormat,
  count: number,
  outputRoot: string | undefined,
): string[] {
  const extension = extensionForFormat(format)
  const absolute = resolve(outputPath)
  const base = directory ? absolute : ensureExtension(absolute, extension)
  const targets: string[] = []

  for (let index = 0; index < count; index += 1) {
    if (directory) {
      targets.push(join(base, `image_${String(index + 1)}${extension}`))
      continue
    }

    if (count === 1) {
      targets.push(base)
      continue
    }

    const ext = extname(base)
    const stem = base.slice(0, base.length - ext.length)
    targets.push(`${stem}-${String(index + 1)}${ext}`)
  }

  if (outputRoot !== undefined) {
    for (const target of targets) {
      assertInsideRoot(outputRoot, target)
    }
  }

  return targets
}

function assertInsideRoot(root: string, target: string): void {
  const relativePath = relative(root, target)

  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ToolError(`输出路径必须位于 GPT_IMAGE_OUTPUT_ROOT 内：${target}`)
  }
}

function ensureExtension(path: string, extension: string): string {
  return extname(path).length > 0 ? path : `${path}${extension}`
}

function mimeTypeFromExtension(path: string): string {
  return MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? 'application/octet-stream'
}
