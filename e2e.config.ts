import type { E2EConfig } from 'e2e';
import {
  createTuturuuuWebE2EConfig,
  FLEET_IDENTITY_ENV_NAMES,
} from './scripts/e2e/shared-web-config.ts';

export default createTuturuuuWebE2EConfig({
  projectId: 'tuturuuu-platform',
  targetName: 'web-chromium',
  appIdentity: 'tuturuuu-web',
  tests: 'apps/web/e2e-agent/**/*.e2e.ts',
  fixtureCommand: {
    executable: process.execPath,
    args: ['scripts/e2e/web-fixture-server.mjs', '--port', '{port}'],
    inheritEnv: [
      ...FLEET_IDENTITY_ENV_NAMES.email,
      ...FLEET_IDENTITY_ENV_NAMES.password,
    ],
  },
  cacheDir: '.e2e/cache',
}) satisfies E2EConfig;
