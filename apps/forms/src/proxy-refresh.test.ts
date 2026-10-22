import { vi } from 'vitest';
import {
  definePageAdapterTests,
  pageAdapterMocks,
} from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('next-intl/middleware', () => ({
  default: () => pageAdapterMocks.continuation,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

import { proxy } from './proxy';

definePageAdapterTests({
  proxy,
  targetApp: 'forms',
  publicPaths: ['/f/share', '/embed/share'],
  anonymousApis: [
    { path: '/api/v1/shared/forms/share', method: 'GET' },
    { path: '/api/v1/shared/forms/share', method: 'POST' },
  ],
});
