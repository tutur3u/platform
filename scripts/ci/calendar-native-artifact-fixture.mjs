import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, posix, resolve } from 'node:path';

export function fixture({ pointerPath, emittedConfigPath }, run) {
  const app = mkdtempSync(resolve(tmpdir(), 'calendar-artifact-'));
  const put = (name, data) => {
    const path = resolve(app, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data));
  };
  const pointer = {
    configPath: posix.relative(posix.dirname(pointerPath), emittedConfigPath),
    auxiliaryWorkers: [],
  };
  const config = {
    name: 'tuturuuu-calendar',
    main: './worker.js',
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    d1_databases: [],
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
      html_handling: 'none',
    },
  };
  put(pointerPath, pointer);
  put(emittedConfigPath, config);
  put(
    'dist/server/worker.js',
    'export default { fetch() { return new Response("fixture"); } };'
  );
  put('dist/client/serwist/sw.js', 'self.addEventListener("fetch", () => {});');
  put('cloudflare-env.d.ts', 'interface CloudflareEnv { ASSETS: Fetcher }');
  try {
    run({ app, put, pointer, config });
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}
