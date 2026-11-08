import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { measureMeetUsage } from '../packages/ai/src/meetings/usage.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = JSON.parse(
  readFileSync(
    new URL('./fixtures/meet-erase-inventory.json', import.meta.url),
    'utf8'
  )
);
const digest = (source) => createHash('sha256').update(source).digest('hex');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const auditReference = (source) =>
  /\b(?:record_version|audit_logs|get_ws_id)\b/i.test(source);

function inventory(directory) {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return ['node_modules', '.next', '.git', 'dist', 'coverage'].includes(
        entry.name
      )
        ? []
        : inventory(file);
    }
    // Tests and type declarations cannot serve product history. SQL migrations are all included.
    if (
      !entry.isFile() ||
      !/\.(?:[cm]?[jt]sx?|sql)$/.test(file) ||
      /(?:\.test\.|\.spec\.|\.d\.ts$|\/__tests__\/|\/__fixtures__\/)/.test(file)
    )
      return [];
    const source = read(file);
    return auditReference(source) ? [[file, digest(source)]] : [];
  });
}

function assertAuditInventory(entries) {
  assert.deepEqual(
    Object.fromEntries(entries.toSorted(([a], [b]) => a.localeCompare(b))),
    baseline.auditReferences,
    'Audit surface changed: review route/RPC/view reachability for workspace_documents history and its S-DH fence before updating this inventory. Do not blindly regenerate.'
  );
}

test('AT-9(h): audit references in web, packages and every migration stay reviewed', () => {
  assertAuditInventory(
    ['apps/web', 'packages', 'apps/database/supabase/migrations'].flatMap(
      inventory
    )
  );
});

for (const [name, source] of Object.entries({
  route:
    "sb.schema('audit').from('record_version').select('record').eq('table_name', 'workspace_documents')",
  rpc: `create function public.document_history() returns setof jsonb as $$ select record from audit.record_version where table_oid = 'public.workspace_documents'::regclass $$ language sql;`,
  view: 'create view public.document_history as select old_record from "audit"."record_version";',
  indirect: 'select record from public.audit_logs;',
  resolver:
    'create or replace function audit.get_ws_id() returns uuid as $$ select null::uuid $$ language sql;',
})) {
  test(`inventory rejects a new ${name} document-history reader`, () => {
    assert.ok(auditReference(source));
    const entries = Object.entries(baseline.auditReferences);
    assert.throws(
      () =>
        assertAuditInventory([
          ...entries,
          [`fixture/${name}.sql`, digest(source)],
        ]),
      /Audit surface changed/
    );
  });
}

test('inventory rejects a document reader added to an already reviewed migration', () => {
  const entries = Object.entries(baseline.auditReferences);
  assert.ok(entries.length > 0);
  entries[0][1] = digest(
    `${read(entries[0][0])}\nselect record from audit.record_version;`
  );
  assert.throws(() => assertAuditInventory(entries), /Audit surface changed/);
});

test('U3: public document page cache posture stays pinned for the S-X adapter', () => {
  const source = read(baseline.publicDocumentPage.path);
  assert.equal(
    digest(source),
    baseline.publicDocumentPage.sha256,
    'Public document page changed: review caching/invalidation and stale-generation suppression with the S-X adapter. This source pin is not a runtime cache receipt.'
  );
  assert.match(source, /\.from\('workspace_documents'\)/);
  assert.match(source, /\.eq\('is_public', true\)/);
  assert.doesNotMatch(
    source,
    /['"]use cache|\b(?:connection|unstable_cache|revalidatePath|revalidateTag)\s*\(|export\s+const\s+(?:dynamic|revalidate)\b/
  );
});

const billingKeys = [
  'audioTokens',
  'available',
  'currency',
  'inputTokens',
  'model',
  'outputTokens',
  'pricing',
  'pricingDate',
];
const assertUsageKeys = (usage) => {
  assert.deepEqual(
    Object.keys(usage).sort(),
    usage.available ? billingKeys : ['available', 'model'],
    'Classify every new usage key as billing or content in a reviewed erase change.'
  );
  if (usage.available)
    assert.deepEqual(Object.keys(usage.pricing).sort(), [
      'audio',
      'output',
      'text',
    ]);
};

test('billing usage return shapes have only the explicitly classified billing keys', () => {
  for (const metadata of [
    null,
    {},
    { promptTokenCount: -1, candidatesTokenCount: 1 },
    { promptTokenCount: 0, candidatesTokenCount: 0 },
    { promptTokenCount: 10, candidatesTokenCount: 2, thoughtsTokenCount: 3 },
    {
      promptTokenCount: 10,
      candidatesTokenCount: 2,
      promptTokensDetails: [
        { modality: 'AUDIO', tokenCount: 7 },
        { modality: 'TEXT', tokenCount: 3 },
      ],
    },
    {
      promptTokenCount: 10,
      candidatesTokenCount: 2,
      promptTokensDetails: [null],
    },
  ]) {
    for (const kind of ['audio', 'text'])
      assertUsageKeys(measureMeetUsage(metadata, kind).usage);
  }
  // Pin the producer too: a new unexercised return branch must receive classification.
  assert.equal(
    digest(read('packages/ai/src/meetings/usage.ts')),
    baseline.usageProducerSha256,
    'Usage producer changed: review all branches and update the billing/content classification tests.'
  );
});

test('usage allowlist refuses unknown top-level and nested keys', () => {
  const { usage } = measureMeetUsage(
    { promptTokenCount: 1, candidatesTokenCount: 1 },
    'text'
  );
  assert.throws(
    () => assertUsageKeys({ ...usage, transcript: 'fixture canary' }),
    /Classify every new usage key/
  );
  assert.throws(() =>
    assertUsageKeys({
      ...usage,
      pricing: { ...usage.pricing, speaker: 'fixture' },
    })
  );
  assert.throws(
    () => assertUsageKeys({ model: 'fixture', available: false, extra: true }),
    /Classify every new usage key/
  );
});
