import {
  createLegacyGetHandler,
  createLegacyHeadHandler,
} from '@/legacy-api-routes/head';
import { GET as implementationGet } from './implementation';
export const GET = createLegacyGetHandler(implementationGet);
export const HEAD = createLegacyHeadHandler(GET);
