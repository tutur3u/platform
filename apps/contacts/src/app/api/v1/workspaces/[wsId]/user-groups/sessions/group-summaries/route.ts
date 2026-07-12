import { GET } from '@tuturuuu/users-core/routes/user-groups/sessions/group-summaries/route';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { GET };
export const HEAD = createLegacyHeadHandler(GET);
