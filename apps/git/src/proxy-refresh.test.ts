import { vi } from 'vitest';
import { definePageAdapterTests } from '../../../packages/auth/src/proxy/page-adapter-test-fixture';

vi.mock('@/constants/common', () => ({
  LOCALE_COOKIE_NAME: 'NEXT_LOCALE',
  WEB_APP_URL: 'https://central.example.test',
}));
vi.mock('@/i18n/routing', () => ({
  routing: {},
  supportedLocales: ['en', 'vi'],
}));

import { proxy } from './proxy';

definePageAdapterTests({
  proxy,
  targetApp: 'git',
  protectedPath: '/-/settings',
});
