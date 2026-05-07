import { createPOST } from '@tuturuuu/auth/cross-app/server';

export const POST = createPOST('learn', {
  sessionMetadata: {
    auth_client: 'learn',
    origin: 'LEARN',
  },
});
