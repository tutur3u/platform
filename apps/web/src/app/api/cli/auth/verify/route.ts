import { createPOST } from '@tuturuuu/auth/cross-app/server';
import { getCliAppSessionPolicy } from '@/lib/app-coordination/session-policy';

export const POST = createPOST('platform', {
  resolveCliSessionPolicy: getCliAppSessionPolicy,
  sessionKind: 'cli-app-session',
});
