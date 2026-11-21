// Bidirectional Mail artifact host scan, the Mail counterpart of
// calendar-host-scan.mjs. Proves each sealed artifact carries only its own
// environment's root host: production bytes never name the staging root host,
// and staging bytes never carry the production Supabase project or a
// production host in the sources that forward requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { files, lineNamesProductionHost } from './calendar-host-scan.mjs';

export const expectedRootHosts = {
  production: ['mail.tuturuuu.com'],
  staging: ['mail.tutur3u.com'],
};
// Public production identifier pinned by supabase-production.yaml; never a credential.
const productionSupabaseRef = 'nzamlzqfdwaaxdefwraj';
const forbidden = {
  production: ['mail.tutur3u.com'],
  staging: [productionSupabaseRef],
};
// Request-forwarding sources of the staging artifact. A production host here
// would be a fallback that carries staging session cookies to production.
// Mount, one-origin and security-profile defaults name production hosts by
// design; the folded rootHosts literal scan covers the mount list itself.
export const forwardingSources = [
  'src/runtime/handler.ts',
  'src/runtime/staging-access.ts',
];
const rootHostsPattern = /["']?rootHosts["']?\s*:\s*\[([^\]]*)\]/gu;

export function scanMailArtifact(dist, profile) {
  assert.ok(Object.hasOwn(expectedRootHosts, profile), 'Unknown Mail profile');
  const root = resolve(dist);
  const expected = expectedRootHosts[profile];
  const lists = [];
  for (const path of files(root)) {
    const text = readFileSync(path, 'utf8');
    const name = relative(root, path);
    for (const needle of forbidden[profile])
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

export function scanMailForwardingSources(appDir, sources = forwardingSources) {
  for (const source of sources) {
    const lines = readFileSync(join(appDir, source), 'utf8').split('\n');
    lines.forEach((line, index) => {
      assert.ok(
        line.includes('host-scan-allow') || !lineNamesProductionHost(line),
        `staging forwarding source ${source}:${index + 1} names a production host`
      );
    });
  }
  return { sources: sources.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dist, profile] = process.argv.slice(2);
  const { lists } = scanMailArtifact(dist, profile);
  if (profile === 'staging')
    scanMailForwardingSources(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/mail')
    );
  console.log(
    `Mail ${profile} artifact host scan passed (${lists} rootHosts literal(s))`
  );
}
