export type NewsletterOutbound = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

/** `send` throws only when the provider definitively did not accept the message; the reserved cap slot is then released. */
export interface NewsletterMailer {
  send(message: NewsletterOutbound): Promise<void>;
}

/** Production stays unconfigured. Tests inject a double. This does not send. */
export function getNewsletterMailer(): NewsletterMailer | null {
  return null;
}
