import { definePageAdapterTests } from '../../../packages/auth/src/proxy/page-adapter-test-fixture';
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
