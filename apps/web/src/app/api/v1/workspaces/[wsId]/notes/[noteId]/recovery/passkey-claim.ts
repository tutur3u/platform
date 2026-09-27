type Claim = {
  sub?: unknown;
  amr?: unknown;
};

/** A refreshed password session never counts as a passkey step-up. */
export function hasRecentPasskeyClaim(
  claims: Claim | null | undefined,
  userId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (claims?.sub !== userId || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as { method?: unknown; timestamp?: unknown };
    return (
      value.method === 'passkey' &&
      typeof value.timestamp === 'number' &&
      value.timestamp <= nowSeconds &&
      value.timestamp >= nowSeconds - 300
    );
  });
}
