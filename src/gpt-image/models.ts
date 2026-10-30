import { ToolError } from '../errors.js'

export type ImageQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto'
export type ImageBackground = 'transparent' | 'opaque' | 'auto'
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'
export type InputFidelity = 'low' | 'high'
export type InputFidelitySupport = 'none' | 'low' | 'both'

export interface ModelCapabilities {
  readonly qualities: readonly ImageQuality[]
  /** 是否支持任意 `WIDTHxHEIGHT`（仍需满足官方的 16 倍数等限制）。 */
  readonly arbitrarySize: boolean
  readonly inputFidelity: InputFidelitySupport
}

export interface ImageOptionInput {
  readonly model: string
  readonly size: string
  readonly quality: ImageQuality
  readonly background: ImageBackground
  readonly outputFormat: ImageOutputFormat
  readonly outputCompression?: number
  readonly inputFidelity?: InputFidelity
}

const MODEL_PREFIX = 'gpt-image-'
const LEGACY_SIZES: readonly string[] = ['1024x1024', '1536x1024', '1024x1536']
const SIZE_PATTERN = /^(\d{1,4})x(\d{1,4})$/u
const MAX_EDGE = 3840
const MIN_TOTAL_PIXELS = 655_360
const MAX_TOTAL_PIXELS = 8_294_400

const CAPABILITIES_25: ModelCapabilities = {
  qualities: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
  arbitrarySize: true,
  inputFidelity: 'none',
}

const CAPABILITIES_2: ModelCapabilities = {
  qualities: ['low', 'medium', 'high', 'auto'],
  arbitrarySize: true,
  inputFidelity: 'none',
}

const CAPABILITIES_15: ModelCapabilities = {
  qualities: ['low', 'medium', 'high', 'auto'],
  arbitrarySize: false,
  inputFidelity: 'both',
}

const CAPABILITIES_MINI: ModelCapabilities = {
  qualities: ['low', 'medium', 'high', 'auto'],
  arbitrarySize: false,
  inputFidelity: 'low',
}

/**
 * 已知模型返回能力表；未知但符合 `gpt-image-` 前缀的模型返回 `undefined`，
 * 由调用方按宽松策略处理，以便新模型无需改代码即可使用。
 */
export function resolveModelCapabilities(model: string): ModelCapabilities | undefined {
  if (model.startsWith('gpt-image-2.5-flare') || model.startsWith('gpt-image-2.5-sunburst')) {
    return CAPABILITIES_25
  }

  if (model === 'gpt-image-2' || model.startsWith('gpt-image-2-')) {
    return CAPABILITIES_2
  }

  if (model === 'gpt-image-1.5' || model.startsWith('gpt-image-1.5-')) {
    return CAPABILITIES_15
  }

  if (model === 'gpt-image-1-mini' || model.startsWith('gpt-image-1-mini-')) {
    return CAPABILITIES_MINI
  }

  return undefined
}

/** 校验通用参数与模型能力，返回能力表（未知模型为 `undefined`）。 */
export function validateImageOptions(input: ImageOptionInput): ModelCapabilities | undefined {
  if (!input.model.startsWith(MODEL_PREFIX)) {
    throw new ToolError(
      `不支持的图像模型 "${input.model}"，模型 ID 必须以 "${MODEL_PREFIX}" 开头。`,
    )
  }

  const capabilities = resolveModelCapabilities(input.model)

  if (capabilities !== undefined && !capabilities.qualities.includes(input.quality)) {
    throw new ToolError(
      `模型 ${input.model} 不支持 quality "${input.quality}"，可用值：${capabilities.qualities.join('、')}。`,
    )
  }

  validateSize(input.model, input.size, capabilities)

  if (input.background === 'transparent' && input.outputFormat === 'jpeg') {
    throw new ToolError(
      'background 为 transparent 时 output_format 不能是 jpeg，请改用 png 或 webp。',
    )
  }

  if (input.outputCompression !== undefined && input.outputFormat === 'png') {
    throw new ToolError('output_compression 仅适用于 jpeg 或 webp。')
  }

  validateInputFidelity(input.model, input.inputFidelity, capabilities)

  return capabilities
}

function validateSize(
  model: string,
  size: string,
  capabilities: ModelCapabilities | undefined,
): void {
  if (size === 'auto') {
    return
  }

  const match = SIZE_PATTERN.exec(size)
  if (match === null) {
    throw new ToolError(`无效的 size "${size}"，应为 "auto" 或 "宽x高"（例如 1536x1024）。`)
  }

  const width = Number(match[1])
  const height = Number(match[2])

  if (width <= 0 || height <= 0) {
    throw new ToolError(`无效的 size "${size}"，宽高必须为正整数。`)
  }

  // 未知模型只校验语法，避免把当前模型的限制错误地套用到新模型上。
  if (capabilities === undefined) {
    return
  }

  if (!capabilities.arbitrarySize) {
    if (!LEGACY_SIZES.includes(size)) {
      throw new ToolError(
        `模型 ${model} 仅支持 ${LEGACY_SIZES.join('、')} 或 auto，收到 "${size}"。`,
      )
    }
    return
  }

  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new ToolError(`size "${size}" 的宽高必须都是 16 的倍数。`)
  }

  if (Math.max(width, height) > MAX_EDGE) {
    throw new ToolError(`size "${size}" 超过最长边 ${String(MAX_EDGE)} 像素的限制。`)
  }

  if (Math.max(width, height) / Math.min(width, height) > 3) {
    throw new ToolError(`size "${size}" 的宽高比不能超过 3:1。`)
  }

  const totalPixels = width * height
  if (totalPixels < MIN_TOTAL_PIXELS || totalPixels > MAX_TOTAL_PIXELS) {
    throw new ToolError(
      `size "${size}" 的总像素必须在 ${String(MIN_TOTAL_PIXELS)} 到 ${String(MAX_TOTAL_PIXELS)} 之间。`,
    )
  }
}

function validateInputFidelity(
  model: string,
  inputFidelity: InputFidelity | undefined,
  capabilities: ModelCapabilities | undefined,
): void {
  if (inputFidelity === undefined || capabilities === undefined) {
    return
  }

  if (capabilities.inputFidelity === 'none') {
    throw new ToolError(`模型 ${model} 不支持 input_fidelity，请省略该参数。`)
  }

  if (capabilities.inputFidelity === 'low' && inputFidelity === 'high') {
    throw new ToolError(`模型 ${model} 仅支持 input_fidelity="low"。`)
  }
}
