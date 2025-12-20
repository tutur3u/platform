import type { MicrosoftOAuthConfig } from '@tuturuuu/microsoft';

/**
 * Returns the Microsoft OAuth configuration from environment variables.
 */
export function getMicrosoftOAuthConfig(): MicrosoftOAuthConfig {
  const config = {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
  };

  return config;
}

/**
 * Checks if the Microsoft OAuth configuration is complete.
 */
export function isMicrosoftConfigComplete(
  config: MicrosoftOAuthConfig
): boolean {
  return !!(config.clientId && config.clientSecret && config.redirectUri);
}
