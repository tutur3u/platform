// Supabase CLI v3 targets the LOCAL stack unless a command gets --remote, so a
// bare `supabase db push` after `supabase link` silently skips the hosted
// project. Hosted mutations also fail unattended without --yes. This guard
// fails CI when a workflow or composite action regresses to the v2 forms or
// names a target other than the linked project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');

// Global flags such as `--workdir dir` may sit between `supabase` and the
// subcommand.
const GLOBALS = String.raw`(?:\s+--?[a-z][a-z-]*(?:[ =](?!-)\S+)?)*`;
// Commands that default to the local stack in v3 and that CI only ever runs
// against a hosted project.
const TARGETED = new RegExp(
  String.raw`\bsupabase${GLOBALS}\s+(db\s+(?:push|pull|dump)|migration\s+(?:list|repair|fetch|up|down|squash)|storage\s+(?:ls|cp|mv|rm)|seed\s+buckets|inspect\s+\S+)\b`,
  'u'
);
// The subset that changes a hosted project and needs unattended consent.
const MUTATING = new RegExp(
  String.raw`\bsupabase${GLOBALS}\s+(db\s+(?:push|pull)|migration\s+(?:repair|up|down|squash)|storage\s+(?:cp|mv|rm)|seed\s+buckets)\b`,
  'u'
);
const FLAG_END = String.raw`(?=\s|$|["')])`;
const REMOTE = /(^|\s)--remote(?=[\s=]|$|["')])/u;
// `--remote <word>` can name another project or branch.
const REMOTE_VALUE = /(^|\s)--remote(?:=|\s+["']?(?![0-9]*[<>])[A-Za-z0-9$_])/u;
const YES = new RegExp(String.raw`(^|\s)--yes${FLAG_END}`, 'u');
// Package scripts that write to a hosted project are human-only.
const HOSTED_SCRIPT =
  /\bbun\s+(?:run\s+)?(?:sbr:\S+|sb:(?:push|pull|sync|linkpush))\b/u;

// Shell `\` continuations join into one logical line before scanning.
const logicalLines = (text) => text.replace(/\\\r?\n\s*/gu, ' ').split('\n');

function violations(text) {
  const found = [];
  logicalLines(text).forEach((raw, index) => {
    const line = raw.replace(/(^|\s)#.*$/u, '');
    const where = `line ${index + 1}`;
    if (REMOTE_VALUE.test(line))
      found.push(
        `${where}: --remote names a target instead of the linked project`
      );
    if (
      /--(?:linked|db-url|project-ref)\b/u.test(line) &&
      !/\bsupabase\s+link\b/u.test(line)
    )
      found.push(`${where}: deprecated v2 target flag`);
    if (HOSTED_SCRIPT.test(line))
      found.push(`${where}: hosted package script in CI`);
    if (!TARGETED.test(line)) return;
    if (!REMOTE.test(line))
      found.push(`${where}: hosted command without --remote`);
    if (MUTATING.test(line) && !YES.test(line))
      found.push(`${where}: hosted mutation without --yes`);
  });
  return found;
}

// Each `--remote` command must follow `supabase link --project-ref` with an
// exact ref variable inside the same `run:` block. A one-line `run:` has no
// room for the link, so a `--remote` command there always fails.
function remoteBlocks(text) {
  const failures = [];
  let linkedRemotes = 0;
  let inBlock = false;
  let linked = false;
  const check = (line) => {
    if (!REMOTE.test(line) || !TARGETED.test(line)) return;
    if (linked) linkedRemotes++;
    else failures.push(line.trim());
  };
  for (const raw of logicalLines(text)) {
    const line = raw.replace(/(^|\s)#.*$/u, '');
    const run = /^\s*(?:-\s+)?run:\s*(.*)$/u.exec(line);
    if (run) {
      linked = false;
      inBlock = /^[|>][-+]?\s*$/u.test(run[1]);
      if (!inBlock) check(run[1]);
      continue;
    }
    if (/^\s*-\s+(?:name|uses|id|if|with|env):/u.test(raw)) {
      inBlock = false;
      continue;
    }
    if (!inBlock) continue;
    if (
      /\bsupabase\s+link\s+--project-ref\s+"\$[A-Z_]+_PROJECT_ID"/u.test(line)
    )
      linked = true;
    check(line);
  }
  return { failures, linkedRemotes };
}

const unlinkedRemote = (text) => remoteBlocks(text).failures;

function files(dir, pattern) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (pattern.test(entry.name)) found.push(full);
    }
  };
  walk(path.join(root, dir));
  return found;
}

const ciFiles = () => [
  ...files('.github/workflows', /\.ya?ml$/u),
  ...files('.github/actions', /\.ya?ml$/u),
];

// supabase-production-migration-only.yaml pins CLI 2.121.0 for one frozen
// recovery apply; its commands live in scripts/ci/production-migration-only.mjs.
const V2_PINNED = new Set(['supabase-production-migration-only.yaml']);

test('every CI hosted Supabase command names --remote, and mutations pass --yes', () => {
  const failures = [];
  let checked = 0;
  for (const file of ciFiles()) {
    if (V2_PINNED.has(path.basename(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (TARGETED.test(text)) checked++;
    for (const v of violations(text))
      failures.push(`${path.relative(root, file)} ${v}`);
    for (const v of unlinkedRemote(text))
      failures.push(`${path.relative(root, file)} --remote before link: ${v}`);
  }
  assert.deepEqual(failures, []);
  // The staging, staging-list and production workflows must be in scope.
  assert.ok(checked >= 3, `only ${checked} workflow(s) matched`);
  for (const name of [
    'supabase-production.yaml',
    'supabase-staging.yaml',
    'supabase-staging-list.yaml',
  ]) {
    const text = fs.readFileSync(
      path.join(root, '.github/workflows', name),
      'utf8'
    );
    assert.ok(
      remoteBlocks(text).linkedRemotes > 0,
      `${name}: no linked --remote command`
    );
  }
});

test('nothing in CI sets SUPABASE_PROJECT_ID, which would redirect bare --remote', () => {
  const offenders = [
    ...ciFiles(),
    ...files('scripts/ci', /\.(?:[cm]?js|ts|sh)$/u),
  ]
    .filter((file) => !V2_PINNED.has(path.basename(file)))
    .filter(
      (file) => !file.endsWith('supabase-cli-remote-target-guard.test.js')
    )
    .filter((file) =>
      /\bSUPABASE_PROJECT_ID\b/u.test(fs.readFileSync(file, 'utf8'))
    )
    .map((file) => path.relative(root, file));
  assert.deepEqual(offenders, []);
});

test('config.toml has no [remotes.*] block that could reshape a hosted target', () => {
  const config = fs.readFileSync(
    path.join(root, 'apps/database/supabase/config.toml'),
    'utf8'
  );
  assert.doesNotMatch(config, /^\s*\[remotes\./mu);
});

test('the guard rejects v2 and named-target forms and accepts the v3 forms', () => {
  const ok = [
    'supabase db push --remote --include-all --yes',
    'x="$(supabase migration list --remote)"',
    'supabase link --project-ref "$X"',
    '# supabase db push --include-all',
    'bun sb:start',
    'bun sb:stop || true',
  ];
  for (const line of ok) assert.deepEqual(violations(line), [], line);
  assert.equal(violations('supabase db push --include-all').length, 2);
  assert.equal(violations('supabase db push --remote --include-all').length, 1);
  assert.equal(violations('supabase migration list --linked').length, 2);
  assert.equal(violations('supabase db push --remote=abc --yes').length, 1);
  assert.equal(
    violations('supabase db push --remote abcdefghijklmnopqrst --yes').length,
    1
  );
  assert.equal(
    violations('supabase --workdir apps/database db push --yes').length,
    1
  );
  assert.equal(violations('bun sb:push').length, 1);
  assert.equal(violations('bun run sbr:reset').length, 1);
  assert.deepEqual(
    unlinkedRemote(
      '      - run: |\n          supabase link --project-ref "$A_PROJECT_ID"\n          supabase db push --remote --yes\n      - run: |\n          supabase migration list --remote\n'
    ),
    ['supabase migration list --remote']
  );
  assert.deepEqual(
    unlinkedRemote('      - run: supabase migration list --remote\n'),
    ['supabase migration list --remote']
  );
  assert.deepEqual(
    violations('supabase migration list --remote | tee list.txt 2>&1'),
    []
  );
  assert.equal(violations('supabase \\\n  db push --include-all').length, 2);
});
