import { GET } from '@tuturuuu/users-core/routes/user-groups/activity-logs/route';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { GET };
export const HEAD = createLegacyHeadHandler(GET);
