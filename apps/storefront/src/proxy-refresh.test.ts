import { definePageAdapterTests } from '../../../packages/auth/src/proxy/page-adapter-test-fixture';
import { proxy } from './proxy';

definePageAdapterTests({
  proxy,
  targetApp: 'storefront',
  anonymousApis: [
    { path: '/api/v1/inventory/storefronts/store', method: 'GET' },
    { path: '/api/v1/inventory/orders/order', method: 'GET' },
  ],
  protectedPath: '/orders',
  publicPaths: ['/store/shop'],
});
