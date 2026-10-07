import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import { GET as getApprovals } from './get';
import { PUT as putApprovals } from './put';

// Preserve the existing request-time GET and bodyless HEAD adapters.
export const GET = createLegacyGetHandler(getApprovals);
export const HEAD = createLegacyHeadHandler(GET);
export const PUT = putApprovals;
