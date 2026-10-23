const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  EXAMPLE_FILES,
  MARKER_FILES,
  checkRepository,
  main,
  parseProjectCap,
  validateAllocation,
} = require('./check-agent-budget.js');

const ROOT = path.resolve(__dirname, '..', '..');
const OWNER = 'owner';
const CAP = 10;

function workers(count, parent = OWNER, prefix = 'w') {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    parent,
    role: 'worker',
    state: 'active',
  }));
}

function allocation(agents, overrides = {}) {
  return {
    version: 1,
    owner: OWNER,
    allocation: CAP,
    observedRuntimeLimit: { limit: CAP, unit: 'per-thread-tree' },
    agents,
    ...overrides,
  };
}

function errorsFor(agents, overrides) {
  return validateAllocation(allocation(agents, overrides), { cap: CAP }).errors;
}

function assertRejected(errors, pattern) {
  assert.ok(
    errors.some((error) => pattern.test(error)),
    `expected an error matching ${pattern}, got ${JSON.stringify(errors)}`
  );
}

test('the repository governance files agree and the example is valid', () => {
  const result = checkRepository(ROOT);
  assert.deepEqual(result.errors, []);
  assert.equal(result.cap, 10);
});

test('AGENTS.md must declare exactly one allocation marker', () => {
  assert.equal(parseProjectCap('Budget `agent-allocation: 10` here.'), 10);
  assert.throws(() => parseProjectCap('no marker'), /exactly one/u);
  assert.throws(
    () => parseProjectCap('`agent-allocation: 10` and `agent-allocation: 5`'),
    /exactly one/u
  );
});

test('ten live agents fit and an eleventh is rejected', () => {
  assert.deepEqual(errorsFor(workers(10)), []);
  const errors = errorsFor(workers(11));
  assertRejected(errors, /11 live agents exceed the allocation of 10/u);
});

test('blocked agents count; done and retired agents release their slot', () => {
  const agents = workers(10);
  agents.push({ ...workers(1, OWNER, 'b')[0], state: 'blocked' });
  assertRejected(errorsFor(agents), /11 live agents/u);
  const released = workers(10);
  released.push({ ...workers(1, OWNER, 'd')[0], state: 'done' });
  released.push({ ...workers(1, OWNER, 'r')[0], state: 'retired' });
  assert.deepEqual(errorsFor(released), []);
});

test('queued, waiting and reserved agents hold slots', () => {
  const agents = workers(8);
  for (const state of ['queued', 'waiting', 'reserved']) {
    agents.push({ ...workers(1, OWNER, state)[0], state });
  }
  assertRejected(errorsFor(agents), /11 live agents/u);
});

test('the allocation records and respects the observed runtime limit', () => {
  assertRejected(
    errorsFor(workers(2), { observedRuntimeLimit: undefined }),
    /observedRuntimeLimit must record/u
  );
  assertRejected(
    errorsFor(workers(2), { observedRuntimeLimit: { limit: 6 } }),
    /observedRuntimeLimit must record/u
  );
  assertRejected(
    errorsFor(workers(2), {
      observedRuntimeLimit: { limit: 6, unit: 'per-thread-tree' },
    }),
    /allocation 10 exceeds the observed runtime limit 6 \(per-thread-tree\)/u
  );
  // A lower observed limit is honored by declaring the lower allocation.
  assert.deepEqual(
    errorsFor(workers(6), {
      allocation: 6,
      observedRuntimeLimit: { limit: 6, unit: 'per-thread-tree' },
    }),
    []
  );
  assertRejected(
    errorsFor(workers(7), {
      allocation: 6,
      observedRuntimeLimit: { limit: 6, unit: 'per-thread-tree' },
    }),
    /7 live agents exceed the allocation of 6/u
  );
});

test('an allocation file cannot raise the project allocation', () => {
  assertRejected(
    errorsFor(workers(2), { allocation: 11 }),
    /exceeds the project allocation 10/u
  );
});

test('a nested lead gets a remaining budget, not ten new slots', () => {
  const lead = {
    id: 'lead',
    parent: OWNER,
    role: 'lead',
    state: 'active',
    budget: 3,
  };
  assert.deepEqual(errorsFor([lead, ...workers(3, 'lead')]), []);
  assertRejected(
    errorsFor([lead, ...workers(4, 'lead')]),
    /lead: children reserve 4, exceeding its remaining budget 3/u
  );
});

test('lead budgets that sum past the project allocation are oversubscribed', () => {
  const leads = [
    { id: 'lead-a', parent: OWNER, role: 'lead', state: 'active', budget: 5 },
    { id: 'lead-b', parent: OWNER, role: 'lead', state: 'active', budget: 4 },
  ];
  // 1 + 5 + 1 + 4 = 11 reserved slots even though only two agents are live.
  assertRejected(
    errorsFor(leads),
    /owner reservations 11 oversubscribe the allocation 10/u
  );
  leads[1].budget = 3;
  assert.deepEqual(errorsFor(leads), []);
});

test('nested leads must fit inside their parent lead budget', () => {
  const agents = [
    { id: 'lead', parent: OWNER, role: 'lead', state: 'active', budget: 3 },
    {
      id: 'sub-lead',
      parent: 'lead',
      role: 'lead',
      state: 'active',
      budget: 3,
    },
  ];
  assertRejected(
    errorsFor(agents),
    /lead: children reserve 4, exceeding its remaining budget 3/u
  );
});

test('the hierarchy stays bounded and only leads delegate', () => {
  const chain = [
    { id: 'l1', parent: OWNER, role: 'lead', state: 'active', budget: 8 },
    { id: 'l2', parent: 'l1', role: 'lead', state: 'active', budget: 6 },
    { id: 'l3', parent: 'l2', role: 'lead', state: 'active', budget: 4 },
    { id: 'l4', parent: 'l3', role: 'worker', state: 'active' },
  ];
  assertRejected(errorsFor(chain), /l4: nesting depth 4 exceeds/u);
  assertRejected(
    errorsFor([
      ...workers(1),
      { id: 'c', parent: 'w-1', role: 'worker', state: 'active' },
    ]),
    /only leads may have children/u
  );
  assertRejected(
    errorsFor([
      { id: 'w', parent: OWNER, role: 'worker', state: 'active', budget: 2 },
    ]),
    /only leads carry a delegated budget/u
  );
  assertRejected(
    errorsFor([{ id: 'l', parent: OWNER, role: 'lead', state: 'active' }]),
    /explicit non-negative remaining budget/u
  );
});

test('structural errors are rejected', () => {
  assertRejected(
    errorsFor([...workers(1), ...workers(1)]),
    /duplicate agent id/u
  );
  assertRejected(
    errorsFor([{ id: 'x', parent: 'ghost', role: 'worker', state: 'active' }]),
    /neither the owner nor a declared agent/u
  );
  assertRejected(
    errorsFor([
      { id: 'a', parent: 'b', role: 'lead', state: 'active', budget: 1 },
      { id: 'b', parent: 'a', role: 'lead', state: 'active', budget: 1 },
    ]),
    /cycle/u
  );
  assertRejected(
    errorsFor([{ id: 'x', parent: OWNER, role: 'boss', state: 'active' }]),
    /role/u
  );
  assertRejected(
    errorsFor([{ id: 'x', parent: OWNER, role: 'worker', state: 'idle' }]),
    /state/u
  );
  assert.deepEqual(validateAllocation(null, { cap: CAP }).errors, [
    'Allocation must be a JSON object.',
  ]);
});

test('live children of finished leads are orphans', () => {
  const agents = [
    { id: 'lead', parent: OWNER, role: 'lead', state: 'done', budget: 2 },
    ...workers(1, 'lead'),
  ];
  assertRejected(errorsFor(agents), /live agent under a done parent lead/u);
});

test('only the owner writes integration and reviewers are independent', () => {
  assertRejected(
    errorsFor([{ ...workers(1)[0], writesIntegration: true }]),
    /only the project owner writes main\/integration/u
  );
  const lead = {
    id: 'lead',
    parent: OWNER,
    role: 'lead',
    state: 'active',
    budget: 2,
  };
  assertRejected(
    errorsFor([
      lead,
      {
        id: 'rev',
        parent: 'lead',
        role: 'reviewer',
        state: 'active',
        reviews: 'lead',
      },
    ]),
    /descendant of the author lead/u
  );
  assertRejected(
    errorsFor([
      {
        id: 'rev',
        parent: OWNER,
        role: 'reviewer',
        state: 'active',
        reviews: 'rev',
      },
    ]),
    /cannot review itself/u
  );
  assertRejected(
    errorsFor([
      { id: 'rev', parent: OWNER, role: 'reviewer', state: 'active' },
    ]),
    /must name a declared agent/u
  );
  assert.deepEqual(
    errorsFor([
      ...workers(1),
      {
        id: 'rev',
        parent: OWNER,
        role: 'reviewer',
        state: 'active',
        reviews: 'w-1',
      },
    ]),
    []
  );
});

test('validation lanes are admitted separately from the agent count', () => {
  const agents = workers(3).map((agent) => ({
    ...agent,
    heavyValidation: true,
  }));
  assertRejected(
    errorsFor(agents, { validationLanes: 2 }),
    /3 live heavy validations exceed 2 validation lanes/u
  );
  assert.deepEqual(errorsFor(agents, { validationLanes: 3 }), []);
});

test('checkRepository rejects disagreeing markers and invalid examples', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-budget-'));
  try {
    for (const file of MARKER_FILES) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(
        path.join(root, file),
        'Budget `agent-allocation: 10`.\n'
      );
    }
    const example = path.join(root, EXAMPLE_FILES[0]);
    fs.mkdirSync(path.dirname(example), { recursive: true });
    fs.writeFileSync(example, JSON.stringify(allocation(workers(10))));
    assert.deepEqual(checkRepository(root).errors, []);

    fs.writeFileSync(
      path.join(root, MARKER_FILES[2]),
      'Budget `agent-allocation: 5`.\n'
    );
    fs.writeFileSync(example, JSON.stringify(allocation(workers(11))));
    const { errors } = checkRepository(root);
    assertRejected(errors, /disagrees with AGENTS\.md \(10\)/u);
    assertRejected(errors, /11 live agents/u);

    const declared = path.join(root, 'allocation.json');
    fs.writeFileSync(declared, JSON.stringify(allocation(workers(11))));
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.equal(main([declared], root), 1);
    } finally {
      console.error = originalError;
    }
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test('runtime scope must be a known unit', () => {
  for (const unit of ['', 'session', 'thread', 'per-project', null]) {
    assertRejected(
      errorsFor(workers(1), { observedRuntimeLimit: { limit: 6, unit } }),
      /unit per-thread-tree or per-parent/u
    );
  }
});

test('per-parent limits constrain direct children, not the tree allocation or grants', () => {
  const lead = {
    id: 'lead',
    parent: OWNER,
    role: 'lead',
    state: 'active',
    budget: 3,
  };
  const options = { observedRuntimeLimit: { limit: 2, unit: 'per-parent' } };
  // Four agents in the tree and a grant of three fit a two-child runtime limit.
  assert.deepEqual(
    errorsFor([lead, ...workers(1), ...workers(2, 'lead', 'nested')], options),
    []
  );
  assertRejected(
    errorsFor(workers(3), options),
    /owner: 3 live direct children exceed/u
  );
  assertRejected(
    errorsFor([lead, ...workers(3, 'lead')], options),
    /lead: 3 live direct children exceed/u
  );
  const finished = workers(2).map((agent) => ({ ...agent, state: 'done' }));
  assert.deepEqual(
    errorsFor([...finished, ...workers(2, OWNER, 'live')], options),
    []
  );
});
