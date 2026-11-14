export class MailSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MailSendError';
  }
}

export function describeMailError(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string' && error) return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
