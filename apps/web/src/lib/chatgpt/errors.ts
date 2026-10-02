export class ChatGPTError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'ChatGPTError';
  }
}

export function chatGPTErrorResponse(error: unknown) {
  return error instanceof ChatGPTError
    ? { message: error.message, status: error.status, code: error.code }
    : {
        message:
          'ChatGPT connection is temporarily unavailable. Retry shortly.',
        status: 503,
        code: 'CHATGPT_UNAVAILABLE',
      };
}
