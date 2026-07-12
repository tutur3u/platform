import {
  GET,
  POST,
} from '@tuturuuu/users-core/routes/user-groups/sessions/[sessionId]/reconcile/route';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { GET, POST };
export const HEAD = createLegacyHeadHandler(GET);
