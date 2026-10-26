// PostgREST headers for the service key. The key goes only in `apikey`.
export function databaseHeaders(env: { SUPABASE_SECRET_KEY: string }) {
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    'Accept-Profile': 'private',
    'Content-Profile': 'private',
  };
}
