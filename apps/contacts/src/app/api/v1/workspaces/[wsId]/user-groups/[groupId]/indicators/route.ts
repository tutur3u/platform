import {
  GET,
  PATCH,
  POST,
} from '@tuturuuu/users-core/routes/user-groups/[groupId]/indicators/route';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { GET, PATCH, POST };
export const HEAD = createLegacyHeadHandler(GET);
