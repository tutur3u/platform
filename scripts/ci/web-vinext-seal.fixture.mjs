import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A minimal vinext family build in a temp directory, for seal tests.
export const SHA = 'a'.repeat(40);
export const BUNDLE = '.cloudflare/output/v1/workers/default/bundle';
export const ASSETS = '.cloudflare/output/v1/workers/default/assets';

export function fixtureApp(t, { family = 'api-core', sha = SHA, chunk } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'web-vinext-seal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'app');
  mkdirSync(join(app, BUNDLE, 'ssr'), { recursive: true });
  mkdirSync(join(app, ASSETS, `_f/${family}/_next/static`), {
    recursive: true,
  });
  mkdirSync(join(app, 'cloudflare/vinext'), { recursive: true });
  writeFileSync(
    join(app, BUNDLE, 'index.mjs'),
    `import "./ssr/index.js";\nconst h="x-tuturuuu-build",c="${sha}";export default {h,c};\n`
  );
  writeFileSync(
    join(app, BUNDLE, 'ssr/index.js'),
    chunk ?? 'const page = "ok";\n'
  );
  writeFileSync(
    join(app, '.cloudflare/output/v1/workers/default/worker.config.json'),
    '{"manifest":{"type":"complete","mainModule":"index.mjs"}}\n'
  );
  writeFileSync(
    join(app, ASSETS, '_headers'),
    `/*\n  x-tuturuuu-build: ${sha}\n`
  );
  writeFileSync(
    join(app, ASSETS, `_f/${family}/_next/static/app.js`),
    'console.log(1);\n'
  );
  writeFileSync(
    join(app, `cloudflare/vinext/${family}.check.json`),
    JSON.stringify({
      redisFree: true,
      reactServerDomWebpack: '19.3.1',
      assetHeaders: join(app, ASSETS, '_headers'),
      gatedMiB: 4.2,
    })
  );
  writeFileSync(
    join(app, `cloudflare/vinext/${family}.dry-run.log`),
    'Total Upload: 9000 KiB / gzip: 3000 KiB\n'
  );
  return { root, app, out: join(root, 'sealed', family), family };
}
