import '@tanstack/react-start/server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STALE_MAILBOX_QUERY_PARAMS = [
  'mailbox',
  'thread',
  'folderId',
  'label',
] as const;

/**
 * Verifies that `userId` is a member of an active managed mailbox `mailboxId`.
 * Any invalid ID, missing membership, refusal, or lookup error returns `false`
 * so the SSR route loader redirects safely instead of throwing a 500 or
 * carrying a foreign mailbox ID into the client.
 */
export async function canAccessRequestedMailbox(
  userId: string,
  mailboxId: string
): Promise<boolean> {
  if (!UUID_PATTERN.test(mailboxId)) return false;
  try {
    const admin = (await createAdminClient({ noCookie: true })) as unknown as {
      schema?: (name: string) => {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (
              column: string,
              value: string
            ) => {
              eq: (
                column: string,
                value: string
              ) => {
                eq: (
                  column: string,
                  value: string
                ) => {
                  maybeSingle: () => Promise<{
                    data: { role?: string | null } | null;
                    error: unknown;
                  }>;
                };
              };
            };
          };
        };
      };
    };
    if (typeof admin.schema !== 'function') return false;
    const { data, error } = await admin
      .schema('private')
      .from('mail_mailbox_members')
      .select(
        'role, mailbox:mail_mailboxes!mail_mailbox_members_mailbox_id_fkey!inner(status)'
      )
      .eq('mailbox_id', mailboxId)
      .eq('user_id', userId)
      .eq('mailbox.status', 'active')
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.role);
  } catch {
    return false;
  }
}

/**
 * Strips stale mailbox-scoped query parameters so a redirect lands cleanly on
 * the active account's inbox without re-requesting the previous account's
 * mailbox, thread, folder, or label.
 */
export function stripStaleMailboxParams(searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams);
  for (const key of STALE_MAILBOX_QUERY_PARAMS) {
    next.delete(key);
  }
  const serialized = next.toString();
  return serialized ? `?${serialized}` : '';
}
