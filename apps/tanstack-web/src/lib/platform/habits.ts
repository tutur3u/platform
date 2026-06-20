import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export const HABITS_ENABLED_SECRET = 'ENABLE_HABITS';

export function isTanStackHabitsEnabled(wsId: string) {
  return verifySecret({
    forceAdmin: true,
    name: HABITS_ENABLED_SECRET,
    value: 'true',
    wsId,
  });
}
