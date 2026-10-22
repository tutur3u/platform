import { vi } from 'vitest';
import {
  definePageAdapterTests,
  pageAdapterMocks,
} from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('@/constants/common', () => ({
  LOCALE_COOKIE_NAME: 'NEXT_LOCALE',
  WEB_APP_URL: 'https://central.example.test',
}));
vi.mock('@/i18n/routing', () => ({
  routing: {},
  supportedLocales: ['en', 'vi'],
}));

vi.mock('next-intl/middleware', () => ({
  default: () => pageAdapterMocks.continuation,
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));

import { proxy } from './proxy';

definePageAdapterTests({
  proxy,
  targetApp: 'git',
  protectedPath: '/-/settings',
});
