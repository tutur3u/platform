import type { SesIdentitySnapshot } from './domain';

export interface NewsletterSesIdentityClient {
  describeIdentity(subdomain: string): Promise<SesIdentitySnapshot | null>;
}

/** Production stays unconfigured. A missing client leaves the claim pending. */
export function getNewsletterSesIdentityClient(): NewsletterSesIdentityClient | null {
  return null;
}
