// `azure` is generic multi-tenant Microsoft, so its `email` claim is whatever
// the signing-in directory says it is rather than a mailbox we have verified.
// Supabase links an OAuth identity into an existing account when the provider
// calls the address verified, so any directory that asserts a Tuturuuu address
// is trusted with the matching account. Keep the Supabase Azure provider pinned
// to a single tenant; on the shared `common` issuer this is an account-takeover
// path. Re-enabled deliberately (see `fix(auth): disable generic microsoft
// oauth`, bbc12462ef, for the removal this reverses).
export const AUTH_OAUTH_PROVIDERS = [
  'apple',
  'google',
  'azure',
  'github',
] as const;

export type AuthOAuthProvider = (typeof AUTH_OAUTH_PROVIDERS)[number];

type AuthOAuthProviderOptions = {
  name: string;
  queryParams?: Record<string, string>;
  scopes?: string;
};

export const AUTH_OAUTH_PROVIDER_OPTIONS: Record<
  AuthOAuthProvider,
  AuthOAuthProviderOptions
> = {
  apple: {
    name: 'Apple',
  },
  google: {
    name: 'Google',
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
  azure: {
    name: 'Microsoft',
    scopes: 'email',
  },
  github: {
    name: 'GitHub',
  },
};

export function getAuthOAuthProviderOptions(provider: AuthOAuthProvider) {
  return AUTH_OAUTH_PROVIDER_OPTIONS[provider];
}
