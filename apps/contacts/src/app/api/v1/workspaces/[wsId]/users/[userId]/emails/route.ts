import { GET } from '@tuturuuu/users-core/routes/users/user-emails';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { GET };
export const HEAD = createLegacyHeadHandler(GET);
