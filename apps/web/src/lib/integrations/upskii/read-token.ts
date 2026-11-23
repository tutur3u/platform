import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { canUserLinkUpskii } from './access';
import type { UpskiiReadScope } from './constants';
import { createUpskiiReadToken } from './link-service';
import type { ExternalAccountLinkStore } from './link-store';

export type MintUpskiiReadTokenResult =
  | { linkId: string; ok: true; token: string; upskiiUserId: string }
  | {
      code: 'EARLY_ACCESS_ONLY' | 'NOT_LINKED' | 'SCOPE_NOT_GRANTED';
      ok: false;
    };

/**
 * The only entry point for a read through a link. The link comes from the
 * session user alone, the early-access gate is checked again, and the token
 * carries the one scope the read needs.
 */
export async function mintUpskiiReadTokenForUser({
  admin,
  scope,
  store,
  userId,
}: {
  admin: TypedSupabaseClient;
  scope: UpskiiReadScope;
  store: ExternalAccountLinkStore;
  userId: string;
}): Promise<MintUpskiiReadTokenResult> {
  const link = await store.findActiveByUser(userId);
  if (!link) return { code: 'NOT_LINKED', ok: false };
  if (!(await canUserLinkUpskii(admin, userId))) {
    return { code: 'EARLY_ACCESS_ONLY', ok: false };
  }
  if (!link.scopes.includes(scope)) {
    return { code: 'SCOPE_NOT_GRANTED', ok: false };
  }
  return {
    linkId: link.id,
    ok: true,
    token: createUpskiiReadToken(link, scope).token,
    upskiiUserId: link.external_subject,
  };
}
