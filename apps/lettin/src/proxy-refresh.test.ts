import { vi } from 'vitest';
import {
  definePageAdapterTests,
  pageAdapterMocks,
} from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('./workspace-route-status', () => ({
  getWorkspaceRouteStatus: async () => null,
}));

vi.mock('next-intl/middleware', () => ({
  default: () => pageAdapterMocks.continuation,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

import { proxy } from './proxy';

definePageAdapterTests({ proxy, targetApp: 'lettin' });
