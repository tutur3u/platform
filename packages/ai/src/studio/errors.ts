export type AiStudioErrorCode =
  | 'invalid_api_key'
  | 'insufficient_credits'
  | 'invalid_request_error'
  | 'model_not_found'
  | 'rate_limit_exceeded'
  | 'server_error';

export class AiStudioError extends Error {
  readonly code: AiStudioErrorCode;
  readonly status: number;
  readonly type: string;

  constructor(
    message: string,
    {
      code,
      status,
      type = 'invalid_request_error',
    }: {
      code: AiStudioErrorCode;
      status: number;
      type?: string;
    }
  ) {
    super(message);
    this.name = 'AiStudioError';
    this.code = code;
    this.status = status;
    this.type = type;
  }
}

export function toOpenAiError(error: unknown, requestId?: string) {
  const studioError =
    error instanceof AiStudioError
      ? error
      : new AiStudioError('The request could not be completed.', {
          code: 'server_error',
          status: 500,
          type: 'server_error',
        });

  return Response.json(
    {
      error: {
        code: studioError.code,
        message: studioError.message,
        param: null,
        type: studioError.type,
      },
    },
    {
      status: studioError.status,
      headers: requestId ? { 'x-request-id': requestId } : undefined,
    }
  );
}
