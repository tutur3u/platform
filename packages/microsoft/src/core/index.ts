/**
 * @tuturuuu/microsoft - Microsoft Graph API integration
 *
 * Provides OAuth2 authentication and Microsoft Graph API client
 * for Microsoft 365 calendar integration.
 */

import type { Configuration } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

// Re-export MSAL types
export type {
  AccountInfo,
  AuthenticationResult,
  AuthorizationCodeRequest,
  AuthorizationUrlRequest,
  Configuration,
} from '@azure/msal-node';
// Re-export MSAL class
export { ConfidentialClientApplication } from '@azure/msal-node';

// Re-export Microsoft Graph client
export { Client as MicrosoftGraphClient };

// Microsoft OAuth configuration interface
export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string; // 'common' for multi-tenant
  redirectUri: string;
}

// Microsoft calendar scopes (read-only to avoid requiring admin approval)
export const MICROSOFT_CALENDAR_SCOPES = [
  // 'https://graph.microsoft.com/Calendars.Read',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
];

// Create MSAL configuration
export function createMsalConfig(config: MicrosoftOAuthConfig): Configuration {
  return {
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
    system: {
      loggerOptions: {
        loggerCallback: (_level: number, message: string) => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[MSAL] ${message}`);
          }
        },
        piiLoggingEnabled: false,
        logLevel: 3, // Error only in production
      },
    },
  };
}

// Create Microsoft Graph client with access token
export function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}
