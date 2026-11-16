import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBasePath } from '../../../packages/start-bridge/src/core/base-path';
import { resolveAppBase } from '../../../packages/start-bridge/src/core/mounts';
import { hiveApexMounts } from './apex-mount';

const shipped = { app: 'hive', ...hiveApexMounts };
let executed = 0;

function check(name: string, run: () => void) {
  run();
  executed += 1;
  console.log(`ok ${executed} ${name}`);
}

check('legacy root-only config does not own the apex path', () => {
  const legacy = {
    app: 'hive',
    rootHosts: ['hive.tuturuuu.com'],
    mountHosts: [] as const,
    unknownHost: 'reject' as const,
  };

  assert.equal(
    resolveAppBase(new URL('https://tuturuuu.com/hive/api/build-info'), legacy),
    null
  );
});

check('ships segment-exact /hive and /hive/* on tuturuuu.com', () => {
  assert.deepEqual(hiveApexMounts.mountHosts, ['tuturuuu.com']);
  assert.equal(hiveApexMounts.basePath, '/hive');
  assert.equal(hiveApexMounts.unknownHost, 'reject');
  assert.deepEqual(hiveApexMounts.rootHosts, ['hive.tuturuuu.com']);

  for (const url of [
    'https://tuturuuu.com/hive',
    'https://tuturuuu.com/hive/',
    'https://TUTURUUU.com/hive/api/build-info?source=roadmap',
    'https://tuturuuu.com/hive/api/build-info/',
  ]) {
    assert.deepEqual(resolveAppBase(new URL(url), shipped), {
      mode: 'mounted',
      basePath: '/hive',
    });
  }

  for (const url of [
    'https://tuturuuu.com/hiveful',
    'https://tuturuuu.com/hiveful/api/build-info',
    'https://tuturuuu.com/api/build-info',
    'https://hive.tuturuuu.com.evil.example/hive',
    'https://evil.example/hive/api/build-info',
    'https://tuturuuu.com.evil.example/hive',
  ]) {
    assert.equal(resolveAppBase(new URL(url), shipped), null);
  }

  assert.deepEqual(
    resolveAppBase(
      new URL('https://hive.tuturuuu.com/api/build-info'),
      shipped
    ),
    { mode: 'root', basePath: '' }
  );
});

check(
  'strips /hive so the existing build-info route answers the apex path',
  () => {
    const base = createBasePath({ app: 'hive', basePath: '/hive' });

    assert.equal(base.strip('/hive/api/build-info'), '/api/build-info');
    assert.equal(base.strip('/hive'), '/');
    assert.equal(base.strip('/hiveful'), null);
    assert.equal(
      base.absoluteUrl('/api/build-info', 'https://tuturuuu.com'),
      'https://tuturuuu.com/hive/api/build-info'
    );
    assert.equal(
      new URL('https://tuturuuu.com/hive/api/build-info?source=roadmap').search,
      '?source=roadmap'
    );
  }
);

check('the app-owned config is what the generated worker spreads', () => {
  const config = readFileSync(
    new URL('../start-bridge.config.ts', import.meta.url),
    'utf8'
  );
  const worker = readFileSync(new URL('./worker.ts', import.meta.url), 'utf8');
  const route = readFileSync(
    new URL('../src/app/api/build-info/route.ts', import.meta.url),
    'utf8'
  );
  const handler = readFileSync(
    new URL('../../../packages/utils/src/build-info-route.ts', import.meta.url),
    'utf8'
  );
  const workflow = readFileSync(
    new URL('../../../.github/workflows/hive-cloudflare.yaml', import.meta.url),
    'utf8'
  );

  assert.match(config, /mounts: hiveApexMounts/);
  assert.match(worker, /\.\.\.appConfig\.mounts/);
  assert.match(route, /createBuildInfoHandler\('hive'\)/);
  assert.match(handler, /'cache-control': 'no-store, max-age=0'/);
  assert.match(
    workflow,
    /node --test cloudflare\/deployment-profile\.test\.mjs cloudflare\/apex-mount\.test\.mjs/
  );
  assert.match(workflow, /NEXT_PUBLIC_APP_URL=https:\/\/hive\.tuturuuu\.com/);
  assert.match(workflow, /NEXT_PUBLIC_APP_URL: https:\/\/hive\.tuturuuu\.com/);
});

console.log(`executed ${executed}`);
