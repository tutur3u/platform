import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { mailApiPath } from './mail-api-options';

export function registerMailBrowserApiPaths() {
  return registerDefaultAppBaseResolver(mailApiPath);
}
