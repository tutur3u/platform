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
