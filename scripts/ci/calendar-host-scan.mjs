// Bidirectional Calendar artifact host scan (staging-web-publisher design §2.4).
// Proves each sealed artifact carries only its own environment's root host:
// the production bytes never name the staging host, and the staging bytes
// never carry the production Supabase project or a production root host.
import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const expectedRootHosts = {
  production: ['calendar.tuturuuu.com'],
  staging: ['calendar.staging.tutur3u.com'],
};
// Public production identifier pinned by supabase-production.yaml; never a credential.
const productionSupabaseRef = 'nzamlzqfdwaaxdefwraj';
const forbidden = {
  production: ['calendar.staging.tutur3u.com'],
  staging: [productionSupabaseRef],
};
// Production hosts (tuturuuu.com and every app subdomain). Shared registries
// legitimately name them inside staging bytes, so they are forbidden in the
// source that forwards requests, where a fallback would carry staging session
// cookies to production. A guard line opts out with `host-scan-allow`.
export const productionHostPattern =
  /(?<![a-z0-9-])(?:[a-z0-9-]+\.)*tuturuuu\.com(?![a-z0-9-])/iu;
export const forwardingSources = [
  'src/runtime/handler.ts',
  'src/runtime/api-owner-routing.ts',
  'src/runtime/request-init.ts',
  'src/runtime/staging-access.ts',
  'src/runtime/tasks-origin.ts',
];
// The retired smoke host. Former production-zone staging names are covered
// by root-cutover.test.ts and the staging-host guard, not repeated here.
const retired = ['calendar-cutover.staging.tutur3u.com'];
const textExtensions = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.css',
  '.txt',
]);
const rootHostsPattern = /["']?rootHosts["']?\s*:\s*\[([^\]]*)\]/gu;

function files(root) {
  const found = [];
  const visit = (path) => {
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), `Artifact symlink forbidden: ${path}`);
    if (stat.isDirectory())
      for (const entry of readdirSync(path).sort()) visit(join(path, entry));
    else if (textExtensions.has(extname(path)) && !path.endsWith('.map'))
      found.push(path);
  };
  visit(root);
  return found;
}

export function scanCalendarArtifact(dist, profile) {
  assert.ok(
    Object.hasOwn(expectedRootHosts, profile),
    'Unknown Calendar profile'
  );
  const root = resolve(dist);
  const expected = expectedRootHosts[profile];
  const lists = [];
  for (const path of files(root)) {
    const text = readFileSync(path, 'utf8');
    const name = relative(root, path);
    for (const needle of [...forbidden[profile], ...retired])
      assert.ok(
        !text.includes(needle),
        `${profile} artifact ${name} contains ${needle}`
      );
    for (const match of text.matchAll(rootHostsPattern)) {
      const hosts = [...match[1].matchAll(/["'`]([^"'`]+)["'`]/gu)].map(
        ([, host]) => host
      );
      if (hosts.length) lists.push({ name, hosts });
    }
  }
  assert.ok(
    lists.length > 0,
    `${profile} artifact has no folded rootHosts literal`
  );
  for (const { name, hosts } of lists)
    assert.deepEqual(
      hosts,
      expected,
      `${profile} artifact ${name} has rootHosts ${hosts.join(',')}`
    );
  return { lists: lists.length };
}

export function scanCalendarForwardingSources(
  appDir,
  sources = forwardingSources
) {
  for (const source of sources) {
    const lines = readFileSync(join(appDir, source), 'utf8').split('\n');
    lines.forEach((line, index) => {
      assert.ok(
        line.includes('host-scan-allow') || !productionHostPattern.test(line),
        `staging forwarding source ${source}:${index + 1} names a production host`
      );
    });
  }
  return { sources: sources.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dist, profile] = process.argv.slice(2);
  const { lists } = scanCalendarArtifact(dist, profile);
  if (profile === 'staging')
    scanCalendarForwardingSources(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/calendar')
    );
  console.log(
    `Calendar ${profile} artifact host scan passed (${lists} rootHosts literal(s))`
  );
}
