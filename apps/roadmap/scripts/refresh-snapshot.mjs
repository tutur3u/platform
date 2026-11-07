import { githubSourceUrl } from '../src/public-evidence-url.ts';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  deriveStage,
  emptyEvidence,
  parseEvidenceInputs,
  timestamp,
} from '../src/migration-evidence.ts';

// Only products with public marketing pages belong in this public snapshot.
const products = [
  ['ai', 'AI', 'ai'],
  ['calendar', 'Calendar', 'calendar'],
  ['chat', 'Chat', 'chat'],
  ['contacts', 'CRM', 'crm'],
  ['drive', 'Drive', 'drive'],
  ['finance', 'Finance', 'finance'],
  ['forms', 'Forms', 'forms'],
  ['hive', 'Hive', 'hive'],
  ['inventory', 'Inventory', 'inventory'],
  ['mail', 'Mail', 'mail'],
  ['meet', 'Meet', 'meet-together'],
  ['storefront', 'Storefront', 'storefront'],
  ['tasks', 'Tasks', 'tasks'],
  ['track', 'Track', 'track'],
];
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
  : Buffer.from('{"schemaVersion":1,"apps":{}}');
const inputs = parseEvidenceInputs(JSON.parse(input.toString('utf8')));
const evidenceInputSha256 = createHash('sha256').update(input).digest('hex');
const checkedAt = timestamp(process.argv[4] ?? new Date().toISOString());
const source = (path) => githubSourceUrl(sourceCommit, path);
const apps = products.map(([id, name, product]) => {
  const marketing = `apps/web/src/app/[locale]/(marketing)/products/${product}/page.tsx`;
  if (!files.includes(marketing))
    throw new Error(`Public product evidence missing: ${id}`);
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
  const merge = stageEvidence.pr?.merge;
  let mergeIncluded = false;
  if (merge) {
    try {
      execFileSync(
        'git',
        ['merge-base', '--is-ancestor', merge.sha, sourceCommit],
        { timeout: 5000, stdio: 'pipe' }
      );
      mergeIncluded = true;
    } catch {
      throw new Error(`Merge evidence is not included in source: ${id}`);
    }
  }
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
  const stage = deriveStage(native, stageEvidence, checkedAt, mergeIncluded);
  return {
    id,
    name,
    productUrl: `https://tuturuuu.com/products/${product}`,
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
