import { definePageAdapterTests } from '../../../packages/auth/src/proxy/page-adapter-test-fixture';
import { proxy } from './proxy';

definePageAdapterTests({ proxy, targetApp: 'pay' });
