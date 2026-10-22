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
  targetApp: 'inventory',
  anonymousApis: [
    { path: '/api/v1/inventory/storefronts/store', method: 'GET' },
    { path: '/api/v1/inventory/orders/order', method: 'GET' },
  ],
});
