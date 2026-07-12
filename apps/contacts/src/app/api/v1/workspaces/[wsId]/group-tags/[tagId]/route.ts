import {
  DELETE,
  GET,
  PUT,
} from '@tuturuuu/users-core/routes/group-tags/[tagId]/route';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { DELETE, GET, PUT };
export const HEAD = createLegacyHeadHandler(GET);
