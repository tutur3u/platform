import { verifyPublicSource } from '../src/source-proof.ts';
import { githubSourceUrl } from '../src/public-evidence-url.ts';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  deriveStage,
  emptyEvidence,
  publicProducts,
  publicRouteDefinition,
  productUrl,
  parseEvidenceInputs,
  timestamp,
} from '../src/migration-evidence.ts';

const sourceCommit = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) {
  throw new Error('Supply an immutable 40-character public source commit');
}
const read = (path) =>
  execFileSync('git', ['show', `${sourceCommit}:${path}`], {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
const files = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', sourceCommit, '--', 'apps'],
  { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024 }
).split('\n');
const policy = read('tuturuuu.ci.ts');
const evidencePath = process.argv[3];
if (evidencePath && statSync(evidencePath).size > 128 * 1024)
  throw new Error('Public evidence input too large');
const input = evidencePath
  ? readFileSync(evidencePath)
  : Buffer.from('{"schemaVersion":2,"apps":{}}');
const inputs = parseEvidenceInputs(JSON.parse(input.toString('utf8')));
const evidenceInputSha256 = createHash('sha256').update(input).digest('hex');
const checkedAt = timestamp(process.argv[4] ?? new Date().toISOString());
const source = (path) => githubSourceUrl(sourceCommit, path);
const apps = publicProducts.map((id) => {
  const name =
    id === 'ai'
      ? 'AI'
      : id === 'contacts'
        ? 'CRM'
        : id[0].toUpperCase() + id.slice(1);
  const product =
    id === 'contacts' ? 'crm' : id === 'meet' ? 'meet-together' : id;
  const route = publicRouteDefinition(id);
  const marketing =
    route?.path ??
    `apps/web/src/app/[locale]/(marketing)/products/${product}/page.tsx`;
  if (!files.includes(marketing))
    throw new Error(`Public product evidence missing: ${id}`);
  if (route && !read(route.path).includes(`createFileRoute('${route.route}')`))
    throw new Error(`Public route definition mismatch: ${id}`);
  const config = files.find((path) =>
    path.startsWith(`apps/${id}/vite.config.`)
  );
  const native = Boolean(
    config &&
    /tanstackStart/.test(read(config)) &&
    /voidPlugin/.test(read(config))
  );
  const evidence = [{ label: 'Public product', url: source(marketing) }];
  if (native)
    evidence.push({ label: 'Source configuration', url: source(config) });
  // Publish only the public state, never operational or security reason strings.
  const held = new RegExp(`\\b${id}:\\s*\\{\\s*state:\\s*'held'`).test(policy);
  const admitted = new RegExp(`\\b${id}:\\s*\\{\\s*state:\\s*'admitted'`).test(
    policy
  );
  if (held || admitted)
    evidence.push({
      label: 'Public publication policy',
      url: source('tuturuuu.ci.ts'),
    });
  if (!native)
    evidence.push({
      label: 'Migration target',
      url: source('apps/docs/build/devops/native-start-migration.mdx'),
    });
  const stageEvidence =
    inputs.find((item) => item.id === id)?.evidence ?? emptyEvidence;
  const mergeIncluded = Boolean(stageEvidence.pr?.merge);
  verifyPublicSource({
    id,
    evidence: stageEvidence,
    sourceCommit,
    readSubtree: (commit, app) =>
      execFileSync('git', ['rev-parse', `${commit}:apps/${app}`], {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 1024,
      }).trim(),
    isAncestor: (commit, source) => {
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', commit, source], {
          timeout: 5000,
          stdio: 'pipe',
        });
        return true;
      } catch {
        return false;
      }
    },
    readReceipt: (url) => {
      const parts = new URL(url).pathname.split('/');
      return execFileSync(
        'git',
        [
          'show',
          `${parts[4]}:${parts.slice(5).map(decodeURIComponent).join('/')}`,
        ],
        { timeout: 5000, maxBuffer: 128 * 1024 }
      );
    },
  });
  if (stageEvidence.pr)
    evidence.unshift({ label: 'Migration PR', url: stageEvidence.pr.url });
  if (stageEvidence.production) {
    evidence.push({
      label: 'Production readback',
      url: stageEvidence.production.url,
    });
    evidence.push({
      label: 'Production receipt',
      url: stageEvidence.production.receiptUrl,
    });
  }
  const stage = deriveStage(
    native,
    stageEvidence,
    checkedAt,
    mergeIncluded,
    sourceCommit
  );
  return {
    id,
    name,
    productUrl: productUrl(id, sourceCommit),
    stage,
    blocked: held,
    workInSource: native,
    stageEvidence,
    mergeIncluded,
    evidence,
    checkedAt,
  };
});
writeFileSync(
  new URL('../src/snapshot.json', import.meta.url),
  JSON.stringify(
    { sourceCommit, checkedAt, evidenceInputSha256, apps },
    null,
    2
  ) + '\n'
);
console.log(
  `Refreshed ${apps.length} allowlisted public products from ${sourceCommit}; stages derived from recorded public evidence`
);
