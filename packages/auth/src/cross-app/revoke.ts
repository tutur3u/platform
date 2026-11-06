/**
 * Where cross-app handoff tokens live. Supabase Postgres today; a Worker
 * store (Durable Object or D1) can implement the same port later.
 */
export interface CrossAppTokenStore {
  revokeAllForUser(userId: string): Promise<void>;
}

/**
 * Revokes every outstanding cross-app token of `userId`. Never throws: a
 * failure is logged and reported as `false` so sign-out and password changes
 * always complete.
 */
export async function revokeCrossAppTokensForUser(
  userId: string,
  store: CrossAppTokenStore
): Promise<boolean> {
  try {
    await store.revokeAllForUser(userId);
    return true;
  } catch (error) {
    console.error('Failed to revoke cross-app tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
