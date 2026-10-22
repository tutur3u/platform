import { vi } from 'vitest';
import { definePageAdapterTests } from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('./workspace-route-status', () => ({
  getWorkspaceRouteStatus: async () => null,
}));

import { proxy } from './proxy';

definePageAdapterTests({ proxy, targetApp: 'lettin' });
