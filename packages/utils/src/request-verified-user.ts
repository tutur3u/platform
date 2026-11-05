import { createHash } from 'node:crypto';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';

export type VerifiedUserResult = {
  data: { user: SupabaseUser | null };
  error: unknown;
};
type Slot = {
  credential: string;
  aliases: Set<string>;
  pending: Promise<VerifiedUserResult>;
  user: SupabaseUser | null;
};

/** One slot per incoming request object; nothing outlives or crosses requests. */
const slots = new WeakMap<object, Slot>();

function credentialKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isVerified(result: VerifiedUserResult) {
  return !result.error && Boolean(result.data?.user);
}

/** Server-revalidated user for the exact credential being verified in this
 * request. A different credential replaces the slot and runs a new lookup.
 * Failed or thrown lookups are evicted, so a later call retries rather than
 * reading them back; only a successful result is ever served from the slot. */
export function getRequestVerifiedUser(
  request: object,
  token: string,
  lookup: () => Promise<VerifiedUserResult>
): Promise<VerifiedUserResult> {
  const key = credentialKey(token);
  const current = slots.get(request);
  if (current && (current.credential === key || current.aliases.has(key)))
    return current.pending;
  const slot: Slot = {
    credential: key,
    aliases: new Set(),
    pending: Promise.resolve({ data: { user: null }, error: null }),
    user: null,
  };
  const evict = () => {
    if (slots.get(request) === slot) slots.delete(request);
  };
  slot.pending = (async () => {
    try {
      const result = await lookup();
      if (isVerified(result)) slot.user = result.data.user;
      else evict();
      return result;
    } catch (error) {
      evict();
      throw error;
    }
  })();
  slots.set(request, slot);
  return slot.pending;
}

/** Bind an app token minted in-process from this request's verified provider
 * session, so its policy check reuses that lookup. Binds only when the slot
 * holds a successful lookup for the same principal as the minted token. */
export function bindRequestAppToken(
  request: object,
  appToken: string,
  userId: string
) {
  const current = slots.get(request);
  if (current?.user?.id === userId)
    current.aliases.add(credentialKey(appToken));
}

/** The successful lookup for `token` in this request, if one already ran. */
export function peekRequestVerifiedUser(
  request: object,
  token: string
): SupabaseUser | null {
  const current = slots.get(request);
  return current?.credential === credentialKey(token) ? current.user : null;
}
