import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

import type { ServerConfig } from '../gpt-image/config.js'
import { generateViaResponses } from '../gpt-image/responses.js'

import { assertOutputTarget, buildImageResult, saveGeneratedImages, toWarning } from './output.js'
import { ok, okImages, run } from './register.js'
import {
  backgroundSchema,
  imageOutputSchema,
  imageSourceSchema,
  inlineSchema,
  modelSchema,
  outputPathSchema,
  overwriteSchema,
  promptSchema,
  qualitySchema,
  reasoningEffortSchema,
  sizeSchema,
} from './schemas.js'

const responsesInputSchema = z.object({
  prompt: promptSchema,
  model: modelSchema.optional(),
  text_model: modelSchema.optional(),
  images: z.array(imageSourceSchema).max(16).optional(),
  size: sizeSchema,
  quality: qualitySchema,
  background: backgroundSchema,
  action: z.enum(['auto', 'generate', 'edit']).default('auto'),
  effort: reasoningEffortSchema,
  previous_response_id: z.string().min(1).max(256).optional(),
  output_path: outputPathSchema,
  overwrite: overwriteSchema,
  inline: inlineSchema,
})

const responsesOutputSchema = imageOutputSchema.extend({
  response_id: z.string().optional(),
})

const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const

export function registerResponsesTools(server: McpServer, config: ServerConfig): void {
  server.registerTool(
    'generate_image_via_responses',
    {
      title: '通过 Responses 生成图片',
      description:
        '通过 OpenAI Responses API 的 image_generation 工具生成图片，支持 previous_response_id 多轮编辑与参考图输入。',
      inputSchema: responsesInputSchema,
      outputSchema: responsesOutputSchema,
      annotations,
    },
    async (args) =>
      run(async () => {
        const model = args.model ?? config.gptImage.defaultModel
        const textModel = args.text_model ?? config.gptImage.responsesModel
        assertOutputTarget(args.inline, args.output_path, config)

        const result = await generateViaResponses(config.gptImage, config.imageIO, {
          prompt: args.prompt,
          model,
          textModel,
          reasoningEffort: args.effort ?? config.gptImage.reasoningEffort,
          size: args.size,
          quality: args.quality,
          background: args.background,
          action: args.action,
          images: args.images,
          previousResponseId: args.previous_response_id,
        })

        let savedPaths: string[] | undefined
        let warning: string | undefined

        if (args.output_path !== undefined) {
          try {
            savedPaths = await saveGeneratedImages(
              config,
              args.output_path,
              'png',
              result.images,
              args.overwrite,
            )
          } catch (error) {
            if (!args.inline) {
              throw error
            }
            warning = toWarning(error)
          }
        }

        const built = buildImageResult({
          title: '图片已生成（Responses）',
          model,
          images: result.images,
          size: args.size,
          quality: args.quality,
          savedPaths,
          warning,
          extra: result.responseId === undefined ? {} : { response_id: result.responseId },
        })

        const markdown =
          result.responseId === undefined
            ? built.markdown
            : `${built.markdown}\n\n- response_id：${result.responseId}`

        return args.inline
          ? okImages(built.data, markdown, result.images)
          : ok(built.data, markdown)
      }),
  )
}
