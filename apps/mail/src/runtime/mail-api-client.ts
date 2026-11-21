import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { mailApiPath } from './mail-api-options';

/**
 * Mail's own helpers (`withMailApiBaseUrl`) resolve through this resolver, so
 * on `tuturuuu.com/mail` they stay same-origin under the mount instead of
 * calling the configured `mail.tuturuuu.com` origin cross-origin.
 */
export function registerMailBrowserApiPaths() {
  return registerDefaultAppBaseResolver(mailApiPath, { app: 'mail' });
}
