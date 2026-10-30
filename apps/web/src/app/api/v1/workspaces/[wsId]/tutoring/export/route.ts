import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import { getTutoringData } from './data';
export const GET = createLegacyGetHandler(getTutoringData);
export const HEAD = createLegacyHeadHandler(GET);
