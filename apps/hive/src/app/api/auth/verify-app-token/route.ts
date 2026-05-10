import { createPOST } from '@tuturuuu/auth/cross-app/server';

export const POST = createPOST('hive', {
  sessionMetadata: {
    auth_client: 'hive',
    origin: 'HIVE',
  },
});
