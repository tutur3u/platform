/**
 * The secret that signs Meet realtime tokens and keys guest cookies. Free of
 * server-only imports so the Meet proxy can verify guest cookies with it.
 */
export function getMeetRealtimeTokenSecret() {
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;

  if (secret?.trim()) return secret.trim();

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Meet call tokens require MEET_REALTIME_TOKEN_SECRET in production'
    );
  }

  return 'meet-local-development-token-secret';
}
