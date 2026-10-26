import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readAppConfig } from './app-config.mjs';

test('reads mounts and worker from a TypeScript app config', (t) => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'start-bridge-app-config-')
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'start-bridge.config.ts');
  assert.deepEqual(readAppConfig(file), { config: {} });

  fs.writeFileSync(
    file,
    `interface Options { worker: { compatibilityFlags: string[] } }
const config: Options & Record<string, unknown> = {
  mounts: { mountHosts: [], unknownHost: 'reject' },
  worker: { compatibilityFlags: ['enable_request_signal'] },
  csp: (nonce: string) => \`script-src 'nonce-\${nonce}'\`,
};
export default config;
`
  );
  assert.deepEqual(readAppConfig(file), {
    config: {
      mounts: { mountHosts: [], unknownHost: 'reject' },
      worker: { compatibilityFlags: ['enable_request_signal'] },
    },
  });

  fs.writeFileSync(file, "import './missing-module';\nexport default {};\n");
  assert.match(
    readAppConfig(file).error ?? '',
    /could not be loaded with Node type stripping/u
  );
});
