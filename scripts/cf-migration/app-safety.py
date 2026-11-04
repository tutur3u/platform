# Canonical source of the former /private/tmp/cf-safety-edit.py generator.
from pathlib import Path
import json,sys,re
app=sys.argv[1]
if not re.fullmatch(r'[a-z][a-z0-9-]*', app): raise ValueError('Invalid app id')
root=Path('apps')/app
package=json.loads((root/'package.json').read_text())
legacy=package['scripts'].get('build:legacy', package['scripts'].get('build', ''))
if not legacy.startswith('next build'): raise ValueError('A retained Next build:legacy is required')
required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','TUTURUUU_APP_COORDINATION_SECRET']
if app=='pay': required+=['POLAR_ACCESS_TOKEN','POLAR_WEBHOOK_SECRET']
(root/'cloudflare/required-bindings.ts').write_text('''// Refuse requests before loading application routes when deployment is incomplete.
const required = %s;
export function missingRequiredBindings(env: object): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return required.some((name) => {
    const value: unknown = Reflect.get(env, name);
    return typeof value !== 'string' || value.trim().length === 0;
  });
}
'''%json.dumps(required))
p=root/'cloudflare/worker.ts';s=p.read_text();s="import { missingRequiredBindings } from './required-bindings';\n"+s
needle='    const response = await' if app=='pay' else ('    if (!resolveAppBase' if app=='drive' else '    let response: Response;')
s=s.replace(needle,"    if (missingRequiredBindings(env)) {\n      return new Response('Required configuration unavailable', {\n        status: 503, headers: { 'Cache-Control': 'no-store' },\n      });\n    }\n"+needle,1);p.write_text(s)
p=root/'void.config.ts';p.write_text(p.read_text().replace('workers_dev: false,','workers_dev: false,\n    preview_urls: false,'))
p=root/'vite.config.mts';s=p.read_text();s=s.replace('  base: bridge.base,',"  define: { ...bridge.define, 'process.env.NODE_ENV': JSON.stringify('production') },\n  base: bridge.base,") if '  define: bridge.define,' not in s else s.replace('  define: bridge.define,',"  define: { ...bridge.define, 'process.env.NODE_ENV': JSON.stringify('production') },")
p.write_text(s)
p=root/'package.json';d=json.loads(p.read_text());d['scripts']['build:legacy']=legacy;p.write_text(json.dumps(d,indent=2)+'\n')
p=root/'vercel.json';d=json.loads(p.read_text()) if p.exists() else {};d['buildCommand']=f'cd ../.. && bun turbo:local run build --filter="@tuturuuu/{app}^..." && bun run --cwd apps/{app} build:legacy';p.write_text(json.dumps(d,indent=2)+'\n')
# Fixture values are synthetic; no provider authentication or outbound traffic is allowed.
s='''import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const required = REQUIRED;
test('anonymous root redirects to login with production host isolation', { timeout: 120000 }, async (t) => {
  const { configPath, config } = readNativeRuntimeConfig(app);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  const scratch = await mkdtemp(join(tmpdir(), '__APP_ID__-cutover-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const local = join(scratch, 'wrangler.json');
  await writeFile(local, JSON.stringify({ ...config,
    main: resolve(dirname(configPath), config.main),
    assets: { ...config.assets, directory: resolve(dirname(configPath), config.assets.directory) },
  }));
  const envFile = join(scratch, 'empty.env');
  await writeFile(envFile, '', { mode: 0o600 });
  const bindings = Object.fromEntries(required.map((name) => [name, { type: 'plain_text',
    value: name === 'NEXT_PUBLIC_SUPABASE_URL' ? 'https://production-smoke.invalid' : 'synthetic-cutover-fixture-value-000000000000',
  }]));
  const sdk = createRequire(join(app, 'package.json'))('wrangler');
  const worker = await sdk.unstable_startWorker({ config: local, envFiles: [envFile],
    sendMetrics: false, bindings, build: { bundle: false, processEntrypoint: false },
    dev: { remote: false, watch: false, persist: false, inspector: false,
      liveReload: false, generateTypes: false, enableContainers: false,
      registry: join(scratch, 'registry'), server: { hostname: '127.0.0.1', port: 0 },
      inferOriginFromRoutes: false, routeRequestsByRoutes: false,
      auth: () => { throw new Error('Provider auth forbidden in cutover smoke'); },
      outboundService: () => new Response('Outbound denied by fixture', { status: 401 }),
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const origin = await worker.url;
  const call = (host) => new Promise((resolveCall, reject) => {
    request({ hostname: origin.hostname, port: origin.port, path: '/', headers: { host } }, (response) => {
      response.resume();
      response.on('end', () => resolveCall({ status: response.statusCode, location: response.headers.location }));
    }).on('error', reject).end();
  });
  const response = await call('__APP_ID__.tuturuuu.com');
  assert.ok([301, 302, 303, 307, 308].includes(response.status), `anonymous root: ${response.status}`);
  assert.equal(new URL(response.location, 'https://__APP_ID__.tuturuuu.com').pathname, '/login');
  assert.equal((await call('untrusted.invalid')).status, 404);
});
'''.replace('__APP_ID__',app).replace('REQUIRED',json.dumps(required))
(root/'cloudflare/cutover.runtime.mjs').write_text(s)
