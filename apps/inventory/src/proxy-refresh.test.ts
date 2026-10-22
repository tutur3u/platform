import { definePageAdapterTests } from '../../../packages/auth/src/proxy/page-adapter-test-fixture';
import { proxy } from './proxy';

definePageAdapterTests({
  proxy,
  targetApp: 'inventory',
  anonymousApis: [
    { path: '/api/v1/inventory/storefronts/store', method: 'GET' },
    { path: '/api/v1/inventory/orders/order', method: 'GET' },
  ],
});
