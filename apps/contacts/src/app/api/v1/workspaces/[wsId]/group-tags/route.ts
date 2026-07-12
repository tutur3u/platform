import { GET, POST } from '@tuturuuu/users-core/routes/group-tags/route';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { GET, POST };
export const HEAD = createLegacyHeadHandler(GET);
