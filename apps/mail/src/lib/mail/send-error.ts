export const MAIL_SEND_PUBLIC_MESSAGE = 'Mail delivery could not be confirmed';

export class MailSendError extends Error {
  constructor(_message: string, options?: { cause?: unknown }) {
    super(MAIL_SEND_PUBLIC_MESSAGE, options);
    this.name = 'MailSendError';
  }
}

export function describeMailError(_error: unknown) {
  return MAIL_SEND_PUBLIC_MESSAGE;
}
