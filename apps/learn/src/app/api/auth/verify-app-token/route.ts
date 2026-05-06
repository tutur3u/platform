import { createPOST } from '@tuturuuu/auth/cross-app/server';

export const POST = createPOST('tulearn', {
  sessionMetadata: {
    auth_client: 'tulearn',
    origin: 'TULEARN',
  },
});
