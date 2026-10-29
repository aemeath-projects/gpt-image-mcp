import { ToolError } from '../errors.js'

/** gpt-image 接口错误；请求封装、鉴权与超时在接入具体功能时补充。 */
export class GptImageApiError extends ToolError {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GptImageApiError'
    this.status = status
  }
}
