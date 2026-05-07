import { createPOST } from '@tuturuuu/auth/cross-app/server';

export const POST = createPOST('teach', {
  sessionMetadata: {
    auth_client: 'teach',
    origin: 'TEACH',
  },
});
