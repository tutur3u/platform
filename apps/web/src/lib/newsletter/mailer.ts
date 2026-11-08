export type NewsletterOutbound = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

export interface NewsletterMailer {
  send(message: NewsletterOutbound): Promise<void>;
}

/** Production stays unconfigured. Tests inject a double. This does not send. */
export function getNewsletterMailer(): NewsletterMailer | null {
  return null;
}
