const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
const localWorkflow = './.github/workflows/';
const scopes = [
  'actions',
  'attestations',
  'checks',
  'contents',
  'deployments',
  'discussions',
  'id-token',
  'issues',
  'models',
  'packages',
  'pages',
  'pull-requests',
  'repository-projects',
  'security-events',
  'statuses',
];

// Workflow-level write scopes reach every job without its own permissions, so
// each one is reviewed here. Jobs should request writes themselves instead.
const workflowWriteScopes = {
  // Single resume job dispatches workflows and records deployment markers.
  'production-package-resume.yaml': ['actions', 'deployments'],
  // Single migration job records the staging deployment marker. The file is a
  // blob-pinned producer contract for Supabase Production.
  'supabase-staging.yaml': ['deployments'],
  // Production publication planner; callees cap themselves (see below).
  'vercel-production.yaml': ['actions', 'deployments'],
  // Reusable publisher: workflow-level permissions cap the caller's grant.
  'wave1-native-publish.yaml': ['deployments'],
};

// Callers allowed to grant reusable workflows more than they request because
// the grant is shared with a non-reusable job. Their callees must declare
// permissions on every job so the effective token stays at the callee's cap.
const sharedGrantCallers = new Set(['vercel-production.yaml']);

function readAllWorkflows() {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        `const dir = process.argv[1];
const out = {};
for (const file of require('node:fs').readdirSync(dir).sort()) {
  if (!/\\.ya?ml$/.test(file)) continue;
  out[file] = Bun.YAML.parse(await Bun.file(dir + '/' + file).text());
}
console.log(JSON.stringify(out));`,
        workflowsDir,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  );
}

const workflows = readAllWorkflows();
const rank = (level) => ({ read: 1, write: 2 })[level] ?? 0;

function expand(permissions) {
  if (permissions === 'write-all' || permissions === 'read-all') {
    const level = permissions.slice(0, -4);
    return Object.fromEntries(scopes.map((scope) => [scope, level]));
  }
  return permissions ?? {};
}

function writeScopes(permissions) {
  return Object.entries(expand(permissions))
    .filter(([, level]) => level === 'write')
    .map(([scope]) => scope)
    .sort();
}

function jobGrant(workflow, job) {
  return expand(job.permissions ?? workflow.permissions);
}

function calleeName(job) {
  return typeof job.uses === 'string' && job.uses.startsWith(localWorkflow)
    ? job.uses.slice(localWorkflow.length)
    : undefined;
}

// GitHub rejects a run whose nested job requests more than its caller grants.
function underGrants(all, file, granted, trail) {
  const workflow = all[file];
  assert.ok(workflow, `${trail} calls missing workflow ${file}`);
  return Object.entries(workflow.jobs).flatMap(([id, job]) => {
    const declared = job.permissions ?? workflow.permissions;
    const requested = declared === undefined ? granted : expand(declared);
    const failures = scopes
      .filter((scope) => rank(requested[scope]) > rank(granted[scope]))
      .map(
        (scope) =>
          `${trail} -> ${file}:${id} requests ${scope}: ${requested[scope]} but is granted ${granted[scope] ?? 'none'}`
      );
    const nested = calleeName(job);
    if (!nested) return failures;
    const effective = Object.fromEntries(
      scopes.map((scope) => [
        scope,
        rank(requested[scope]) < rank(granted[scope])
          ? requested[scope]
          : granted[scope],
      ])
    );
    return [
      ...failures,
      ...underGrants(all, nested, effective, `${trail} -> ${file}:${id}`),
    ];
  });
}

// Highest permissions a reusable workflow can use, or undefined when any job
// inherits the caller's grant and so can use all of it.
function calleeCap(all, file) {
  const workflow = all[file];
  const cap = {};
  for (const job of Object.values(workflow.jobs)) {
    const declared = job.permissions ?? workflow.permissions;
    if (declared === undefined) return undefined;
    let requested = expand(declared);
    const nested = calleeName(job);
    if (nested) {
      const nestedCap = calleeCap(all, nested);
      if (!nestedCap) return undefined;
      requested = Object.fromEntries(
        scopes.map((scope) => [
          scope,
          rank(nestedCap[scope]) < rank(requested[scope])
            ? nestedCap[scope]
            : requested[scope],
        ])
      );
    }
    for (const scope of scopes) {
      if (rank(requested[scope]) > rank(cap[scope]))
        cap[scope] = requested[scope];
    }
  }
  return cap;
}

function reusableCallers(all) {
  return Object.entries(all).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {})
      .filter(([, job]) => calleeName(job))
      .map(([id, job]) => ({ file, id, job, workflow }))
  );
}

function defaultFailures(all) {
  return Object.entries(all).flatMap(([file, workflow]) => {
    const permissions = workflow.permissions;
    if (permissions === null || typeof permissions !== 'object') {
      return [`${file} must declare a workflow-level permissions map`];
    }
    const failures = [];
    // `{}` (no scopes) is stricter than the contents: read default.
    if (rank(permissions.contents) > 1) {
      failures.push(`${file} must default contents to read or none`);
    }
    const writes = writeScopes(permissions).join(',');
    const allowed = [...(workflowWriteScopes[file] ?? [])].sort().join(',');
    if (writes !== allowed) {
      failures.push(`${file} workflow-level writes [${writes}]; move to jobs`);
    }
    return failures;
  });
}

function blanketFailures(all) {
  return Object.entries(all).flatMap(([file, workflow]) =>
    [
      ['workflow', workflow.permissions],
      ...Object.entries(workflow.jobs ?? {}).map(([id, job]) => [
        id,
        job.permissions,
      ]),
    ]
      .filter(([, permissions]) => typeof permissions === 'string')
      .map(([where, permissions]) => `${file}:${where} uses ${permissions}`)
  );
}

function underGrantFailures(all) {
  return reusableCallers(all).flatMap(({ file, id, job, workflow }) =>
    underGrants(all, calleeName(job), jobGrant(workflow, job), `${file}:${id}`)
  );
}

function overGrantFailures(all) {
  return reusableCallers(all).flatMap(({ file, id, job, workflow }) => {
    const cap = calleeCap(all, calleeName(job));
    if (!cap) return [`${file}:${id} callee has a job without permissions`];
    if (sharedGrantCallers.has(file)) return [];
    const granted = jobGrant(workflow, job);
    return scopes
      .filter((scope) => rank(granted[scope]) > rank(cap[scope]))
      .map(
        (scope) =>
          `${file}:${id} grants ${scope}: ${granted[scope]} but ${calleeName(job)} uses ${cap[scope] ?? 'none'}`
      );
  });
}

test('every workflow declares a least-privilege default', () => {
  assert.ok(Object.keys(workflows).length > 100);
  assert.deepEqual(defaultFailures(workflows), []);
});

test('no workflow or job uses blanket permissions', () => {
  assert.deepEqual(blanketFailures(workflows), []);
});

test('reusable workflow callers grant what each callee requests', () => {
  assert.deepEqual(underGrantFailures(workflows), []);
});

test('reusable workflow callers grant no more than callees can use', () => {
  assert.deepEqual(overGrantFailures(workflows), []);
});

test('permission checks reject each regression', () => {
  const { file, id } = reusableCallers(workflows).find(
    ({ file: caller, job }) =>
      calleeName(job) === 'ci-check.yml' && !sharedGrantCallers.has(caller)
  );
  const mutate = (change) => {
    const copy = structuredClone(workflows);
    change(copy);
    return copy;
  };

  const underGranted = mutate((all) => {
    all[file].jobs[id].permissions = { contents: 'read' };
  });
  assert.match(
    underGrantFailures(underGranted).join('\n'),
    /requests deployments: read but is granted none/
  );

  const overGranted = mutate((all) => {
    all[file].jobs[id].permissions = { contents: 'write', deployments: 'read' };
  });
  assert.match(
    overGrantFailures(overGranted).join('\n'),
    /grants contents: write but ci-check\.yml uses read/
  );

  const inheritedCallee = mutate((all) => {
    delete all['ci-check.yml'].permissions;
    delete all['ci-check.yml'].jobs.check.permissions;
  });
  assert.match(
    overGrantFailures(inheritedCallee).join('\n'),
    /callee has a job without permissions/
  );

  const missingDefault = mutate((all) => {
    delete all[file].permissions;
  });
  assert.match(
    defaultFailures(missingDefault).join('\n'),
    /must declare a workflow-level permissions map/
  );

  const workflowWrite = mutate((all) => {
    all[file].permissions = { contents: 'read', 'pull-requests': 'write' };
  });
  assert.match(
    defaultFailures(workflowWrite).join('\n'),
    /workflow-level writes \[pull-requests\]/
  );

  const blanket = mutate((all) => {
    all[file].jobs[id].permissions = 'write-all';
  });
  assert.match(blanketFailures(blanket).join('\n'), /uses write-all/);
});
