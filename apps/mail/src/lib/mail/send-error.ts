export const MAIL_SEND_PUBLIC_MESSAGE = 'Mail delivery could not be confirmed';

export class MailSendError extends Error {
  constructor() {
    super(MAIL_SEND_PUBLIC_MESSAGE);
    this.name = 'MailSendError';
  }
}
