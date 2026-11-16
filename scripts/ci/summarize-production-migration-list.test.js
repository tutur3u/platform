const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const scriptPath = path.join(
  __dirname,
  'summarize-production-migration-list.sh'
);
const fixturePath = path.join(
  __dirname,
  'fixtures/supabase-migration-list-backticks.txt'
);
const workflowPath = path.join(
  repoRoot,
  '.github/workflows/supabase-production.yaml'
);
const matchedVersions = [
  '20230202082703',
  '20231204107450',
  '20261111120310',
  '20261112133000',
];

function catalog(t, versions) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'prod-migration-list-')
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const version of versions) {
    fs.writeFileSync(path.join(directory, `${version}_fixture.sql`), '-- fixture\n');
  }
  return directory;
}

function summarize(listing, directory, env = {}) {
  return spawnSync('bash', [scriptPath, directory], {
    input: listing,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function between(text, begin, end) {
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  assert.ok(start >= 0 && stop > start, `missing ${begin} block`);
  return text.slice(start + begin.length, stop);
}

test('the space-only counter reads no versions from the backtick fixture', () => {
  const listing = fs.readFileSync(fixturePath, 'utf8');
  assert.match(listing, /`20261112133000` \| `20261112133000`/);
  assert.match(listing, /\| `20231204107450`/);
  const old = spawnSync(
    'awk',
    [
      '-F|',
      'NF >= 3 { gsub(/[[:space:]]/, "", $2); if ($2 ~ /^[0-9]+$/) print $2 }',
    ],
    { input: listing, encoding: 'utf8' }
  );
  assert.equal(old.status, 0);
  assert.equal(old.stdout, '');
});

test('a clean backtick table exits 0 and reports no pending versions', (t) => {
  const listing = fs.readFileSync(fixturePath, 'utf8');
  const summary = path.join(catalog(t, []), 'unused');
  const directory = catalog(t, matchedVersions);
  const sha = 'c'.repeat(40);
  const result = summarize(listing, directory, {
    GITHUB_SHA: sha,
    GITHUB_STEP_SUMMARY: summary,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const expected = [
    `catalog_sha=${sha}`,
    'local_max=20261112133000',
    'remote_max=20261112133000',
    'local_versions_at_or_below_20261112133000=4',
    'missing_at_or_below_20261112133000=0',
    'pending_count=0',
    'remote_only_count=0',
    'MISSING_AT_OR_BELOW_20261112133000_BEGIN',
    '',
    'MISSING_AT_OR_BELOW_20261112133000_END',
    'PENDING_BEGIN',
    '',
    'PENDING_END',
    'REMOTE_ONLY_BEGIN',
    '',
    'REMOTE_ONLY_END',
    '',
  ].join('\n');
  assert.equal(result.stdout, expected);
  assert.equal(fs.readFileSync(summary, 'utf8'), expected);
});

test('bare digit cells still exit 0 on a clean match', (t) => {
  const listing =
    '   20230202082703 | 20230202082703 | 2023-02-02 08:27:03\n';
  const result = summarize(listing, catalog(t, ['20230202082703']), {
    GITHUB_SHA: 'bare',
  });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^local_max=20230202082703$/m);
  assert.match(result.stdout, /^remote_max=20230202082703$/m);
  assert.match(result.stdout, /^pending_count=0$/m);
  assert.match(result.stdout, /^remote_only_count=0$/m);
  assert.match(result.stdout, /^missing_at_or_below_20261112133000=0$/m);
});

test('a local-only version at or below the cutoff is pending and still exits 0', (t) => {
  const listing = fs.readFileSync(fixturePath, 'utf8');
  const result = summarize(
    listing,
    catalog(t, [...matchedVersions, '20261110120000']),
    { GITHUB_SHA: 'pending' }
  );
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^pending_count=1$/m);
  assert.match(result.stdout, /^missing_at_or_below_20261112133000=1$/m);
  assert.match(result.stdout, /^remote_only_count=0$/m);
  assert.equal(between(result.stdout, 'PENDING_BEGIN\n', 'PENDING_END'), '20261110120000\n');
  assert.match(
    between(result.stdout, 'MISSING_AT_OR_BELOW_20261112133000_BEGIN\n', 'MISSING_AT_OR_BELOW_20261112133000_END'),
    /20261110120000/
  );
});

test('a remote version absent from the catalog exits 0 as remote-only', (t) => {
  const listing =
    fs.readFileSync(fixturePath, 'utf8').trimEnd() +
    '\n   ` ` | `20240124010108` | `2024-01-24 01:01:08` \n';
  const result = summarize(listing, catalog(t, matchedVersions), {
    GITHUB_SHA: 'remote-only',
  });
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^pending_count=0$/m);
  assert.match(result.stdout, /^remote_only_count=1$/m);
  assert.match(result.stdout, /^remote_max=20261112133000$/m);
  assert.equal(
    between(result.stdout, 'REMOTE_ONLY_BEGIN\n', 'REMOTE_ONLY_END'),
    '20240124010108\n'
  );
});

test('a header with no version cells exits 1', (t) => {
  const listing = [
    'Connecting to remote database...',
    '',
    '  ',
    '   Local | Remote | Time (UTC) ',
    '  -------|--------|------------',
    '',
  ].join('\n');
  const result = summarize(listing, catalog(t, matchedVersions));
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /Production migration list returned no remote versions/
  );
  assert.doesNotMatch(result.stdout, /Main migration catalog is empty/);
});

test('parsed remote versions against an empty catalog exit 1', (t) => {
  const listing = fs.readFileSync(fixturePath, 'utf8');
  const result = summarize(listing, catalog(t, []));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Main migration catalog is empty/);
});

test('the list step calls the parser and leaves the apply command once', () => {
  const yaml = fs.readFileSync(workflowPath, 'utf8');
  assert.equal(yaml.split('supabase db push --include-all').length - 1, 1);
  assert.match(yaml, /inputs\.list_only != true/);
  const list = yaml.slice(yaml.indexOf('  list-versions:'));
  assert.match(list, /inputs\.list_only == true/);
  assert.match(
    list,
    /printf '%s\\n' "\$listing" \| "\$GITHUB_WORKSPACE\/scripts\/ci\/summarize-production-migration-list\.sh" supabase\/migrations/
  );
  assert.match(list, /supabase link --project-ref "\$PRODUCTION_PROJECT_ID"/);
  assert.match(list, /supabase migration list --linked/);
  assert.doesNotMatch(list, /gsub\(\/\[\[:space:\]\]\/, "", \$2\)/);
  assert.doesNotMatch(list, /supabase db push/);
  assert.match(list, /contents: read/);
  assert.match(list, /deployments: write/);
  assert.match(
    fs.readFileSync(scriptPath, 'utf8'),
    /gsub\(\/\[\[:space:\]`\]\/, "", \$2\)/
  );
});
