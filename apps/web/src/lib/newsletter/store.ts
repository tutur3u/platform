import { NewsletterGateError, type NewsletterGateCode } from './domain';

type PrivateError = { code?: string; message?: string };

type PrivateRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: PrivateError | null }>;

export type NewsletterAdmin = {
  schema: (name: 'private') => { rpc: PrivateRpc };
};

const STORE_CODES: ReadonlyArray<readonly [string, NewsletterGateCode]> = [
  ['newsletter_sender_missing', 'sender_missing'],
  ['newsletter_sender_suspended', 'sender_suspended'],
  ['newsletter_sender_not_approved', 'sender_not_approved'],
  ['newsletter_domain_suspended', 'domain_suspended'],
  ['newsletter_domain_not_approved', 'domain_not_approved'],
  ['newsletter_domain_unverified', 'domain_unverified'],
  ['newsletter_flag_disabled', 'flag_disabled'],
  ['newsletter_daily_cap', 'daily_cap'],
  ['newsletter_delivery_state', 'delivery_state'],
  ['newsletter_invalid_email', 'invalid_email'],
  ['newsletter_invalid_domain', 'invalid_subdomain'],
  ['newsletter_invalid_action', 'invalid_request'],
  ['newsletter_local_part', 'invalid_local_part'],
  ['newsletter_recipient', 'recipient_not_actor'],
  ['newsletter_token_hash', 'invalid_token'],
  ['newsletter_not_found', 'domain_missing'],
  ['newsletter_dns', 'ses_records'],
  ['newsletter_actor', 'store_failed'],
];

export function asNewsletterAdmin(admin: unknown): NewsletterAdmin {
  return admin as NewsletterAdmin;
}

function mapStoreFailure(error: PrivateError): NewsletterGateError {
  const message = error.message ?? '';
  if (error.code === '23505' || /duplicate key/i.test(message)) {
    return new NewsletterGateError('conflict');
  }
  if (error.code === '23514') return new NewsletterGateError('ses_records');
  for (const [needle, code] of STORE_CODES) {
    if (message.includes(needle)) return new NewsletterGateError(code);
  }
  return new NewsletterGateError('store_failed');
}

export async function callNewsletter(
  admin: NewsletterAdmin,
  fn: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const { data, error } = await admin.schema('private').rpc(fn, args);
  if (error) throw mapStoreFailure(error);
  return data;
}
