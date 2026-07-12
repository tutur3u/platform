import {
  DELETE,
  GET,
  PUT,
} from '@tuturuuu/users-core/routes/user-groups/[groupId]/route';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { DELETE, GET, PUT };
export const HEAD = createLegacyHeadHandler(GET);
