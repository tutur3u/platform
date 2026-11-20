import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  MEET_BASE_PATH,
  MEET_CANONICAL_ORIGIN,
} from '@tuturuuu/utils/meet-url';

declare global {
  var __meetCspNonce: (() => string | undefined) | undefined;
}

const root = createBasePath({ app: 'meet' });
const mounted = createBasePath({ app: 'meet', basePath: MEET_BASE_PATH });

export function meetRequestBase(url: URL) {
  return url.origin === MEET_CANONICAL_ORIGIN ? mounted : root;
}
