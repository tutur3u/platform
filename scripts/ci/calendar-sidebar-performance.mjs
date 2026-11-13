#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const fixture = path.join(
  repo,
  'packages/ui/tests/calendar-sidebar-performance'
);
const baselineIndex = process.argv.indexOf('--baseline');
const baseline = baselineIndex === -1 ? null : process.argv[baselineIndex + 1];
if (baselineIndex !== -1 && !/^[a-f0-9]{40}$/.test(baseline ?? '')) {
  throw new Error('--baseline requires a full immutable Git SHA');
}
const baselineFiles = new Set([
  'apps/calendar/src/components/calendar-list-sidebar.tsx',
  ...[
    'calendar-connections-unified',
    'calendar-connections-compact',
    'calendar-sync-attention-button',
  ].map(
    (name) =>
      `packages/ui/src/components/ui/calendar-app/components/${name}.tsx`
  ),
]);
const requireCalendar = createRequire(
  path.join(repo, 'apps/calendar/package.json')
);
const { createServer } = await import(requireCalendar.resolve('vite'));
const react = (await import(requireCalendar.resolve('@vitejs/plugin-react')))
  .default;
const tailwind = (await import(requireCalendar.resolve('@tailwindcss/postcss')))
  .default;
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const aliases = [];
for (const name of ['ui', 'utils', 'icons']) {
  const directory = path.join(repo, 'packages', name);
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  for (const [key, value] of Object.entries(pkg.exports)) {
    const target = typeof value === 'string' ? value : value.import;
    if (!target) continue;
    const specifier = `@tuturuuu/${name}${key === '.' ? '' : key.slice(1)}`;
    aliases.push({
      find: new RegExp(`^${specifier.split('*').map(escape).join('(.+)')}$`),
      replacement: path.join(directory, target).replaceAll('*', '$1'),
    });
  }
}
aliases.sort(
  (a, b) =>
    Number(a.find.source.includes('(.+)')) -
      Number(b.find.source.includes('(.+)')) ||
    b.find.source.length - a.find.source.length
);

const server = await createServer({
  root: fixture,
  configFile: false,
  cacheDir: path.join(repo, 'output/m22-vite-cache'),
  plugins: [
    {
      name: 'synthetic-calendar-services',
      enforce: 'pre',
      resolveId(id) {
        if (/\/use-calendar-connections-manager(?:\.ts)?$/.test(id)) {
          return path.join(fixture, 'manager.ts');
        }
        if (id === 'next/image') return path.join(fixture, 'image.tsx');
      },
      load(id) {
        const file = path.relative(repo, id.split('?')[0]);
        if (baseline && baselineFiles.has(file)) {
          return execFileSync('git', ['show', `${baseline}:${file}`], {
            cwd: repo,
            encoding: 'utf8',
          });
        }
      },
    },
    react(),
  ],
  resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
  css: { postcss: { plugins: [tailwind({ base: fixture })] } },
  logLevel: 'warn',
  server: {
    host: '127.0.0.1',
    port: 4193,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
    watch: null,
    hmr: false,
    fs: { allow: [repo] },
  },
});

await server.listen();
console.log('Synthetic Calendar fixture: http://127.0.0.1:4193');
console.log('No auth, database, provider, or live API services are connected.');
console.log(`Source: ${baseline ? `baseline ${baseline}` : 'working tree'}`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
