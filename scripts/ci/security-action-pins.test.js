// Every remote action the security workflows execute must be pinned to a full
// commit SHA, including actions reached transitively through local composite
// actions (./.github/actions/*) and local reusable workflows
// (./.github/workflows/*.yml). A mutable tag anywhere in that graph would let
// an upstream tag move change what the security checks run.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const repoRoot = path.resolve(__dirname, '../..');
const roots = [
  '.github/workflows/codeql.yml',
  '.github/workflows/security-checks.yaml',
  '.github/workflows/security-review-classifier.yaml',
  '.github/workflows/security-review-reclassify.yaml',
  '.github/workflows/security-review-recheck.yaml',
  '.github/workflows/security-review-sweep.yaml',
];

function loadFile(file) {
  return readWorkflow(path.resolve(repoRoot, file));
}

function localActionFile(ref, exists) {
  const dir = ref.replace(/^\.\//u, '');
  const candidates = [`${dir}/action.yml`, `${dir}/action.yaml`];
  const found = candidates.find(exists);
  assert.ok(found, `missing local action ${ref}`);
  return found;
}

// Returns { visited, violations } for the graph reachable from `entries`.
function walkUses(
  entries,
  {
    exists = (file) => fs.existsSync(path.resolve(repoRoot, file)),
    load = loadFile,
  } = {}
) {
  const visited = new Set();
  const violations = [];
  const queue = [...entries];
  const check = (where, ref) => {
    if (ref.startsWith('./.github/workflows/')) {
      queue.push(ref.slice(2));
    } else if (ref.startsWith('./')) {
      queue.push(localActionFile(ref, exists));
    } else if (ref.startsWith('docker://')) {
      if (!/@sha256:[0-9a-f]{64}$/u.test(ref))
        violations.push(`${where}: ${ref}`);
    } else if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/u.test(ref)) {
      violations.push(`${where}: ${ref}`);
    }
  };
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const document = load(file);
    for (const [id, job] of Object.entries(document.jobs ?? {})) {
      if (job.uses) check(`${file}:${id}`, job.uses);
      for (const step of job.steps ?? []) {
        if (step.uses) check(`${file}:${id}`, step.uses);
      }
    }
    for (const step of document.runs?.steps ?? []) {
      if (step.uses) check(file, step.uses);
    }
  }
  return { violations, visited };
}

test('security workflows pin every transitively executed remote action', () => {
  const { violations, visited } = walkUses(roots);
  // Reached only through a local composite action (workflow-trust job); the
  // security workflows no longer call the ci-check switchboard (REV-6456-9).
  for (const reached of ['.github/actions/setup-bun-with-retry/action.yml']) {
    assert.ok(visited.has(reached), `${reached} must stay covered`);
  }
  assert.deepEqual(violations, []);
});

test('the walker follows composite actions and reusable workflows', () => {
  const graph = {
    'root.yml': {
      jobs: {
        call: { uses: './.github/workflows/reusable.yml' },
        steps: {
          steps: [
            { uses: './.github/actions/composite' },
            {
              uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
            },
          ],
        },
      },
    },
    '.github/workflows/reusable.yml': {
      jobs: { inner: { steps: [{ uses: 'actions/setup-node@v7' }] } },
    },
    '.github/actions/composite/action.yml': {
      runs: {
        steps: [
          { uses: 'actions/cache@v6' },
          { uses: 'docker://alpine:3' },
          {
            uses: 'actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
          },
        ],
      },
    },
  };
  const { violations, visited } = walkUses(['root.yml'], {
    exists: (file) => file in graph,
    load: (file) => graph[file],
  });
  assert.equal(visited.size, 3);
  assert.deepEqual(violations.sort(), [
    '.github/actions/composite/action.yml: actions/cache@v6',
    '.github/actions/composite/action.yml: docker://alpine:3',
    '.github/workflows/reusable.yml:inner: actions/setup-node@v7',
  ]);
});
