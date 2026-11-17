const assert = require('node:assert/strict');
const test = require('node:test');
const {
  admitDispatch,
  PublicAdmissionError,
} = require('./trusted-public-admission');
const {
  dispatchFixture,
  main,
  source,
  control,
  blob,
} = require('./fixtures/public-dispatch-fixture.cjs');

for (const stem of ['public-build-artifact', 'public-merged-main-tests']) {
  test(`${stem}: admits a fresh merged-main dispatch without runner attachment`, async () => {
    const fixture = dispatchFixture(stem);
    assert.deepEqual(await admitDispatch(fixture.options), {
      qualified: true,
      sourceSHA: source,
      controlSHA: control,
      mainSHA: main,
      runID: 1001,
      attempt: 2,
      runner: 'github-hosted',
      attachment: 'held',
    });
    assert.equal(
      fixture.calls.filter((call) => call.method === 'permission').length,
      2
    );
    assert.equal(
      fixture.calls.filter((call) => call.method === 'content').length,
      12
    );
    assert.ok(
      fixture.calls.length <= 25,
      'admission reads must remain bounded'
    );
  });
}

const mutations = [
  [
    'PUBLIC_DISPATCH_REPOSITORY',
    (f) => {
      f.state.repo.id = 14;
    },
  ],
  [
    'PUBLIC_DISPATCH_REPOSITORY',
    (f) => {
      f.state.repo.fork = true;
    },
  ],
  [
    'PUBLIC_DISPATCH_REPOSITORY',
    (f) => {
      f.state.repo.private = true;
    },
  ],
  [
    'PUBLIC_DISPATCH_REPOSITORY',
    (f) => {
      f.state.repo.default_branch = 'preview';
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.id = 1002;
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.run_attempt = 3;
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.repository.id = 14;
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.head_repository.id = 14;
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.event = 'pull_request';
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.head_branch = 'preview';
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.head_sha = 'e'.repeat(40);
    },
  ],
  [
    'PUBLIC_DISPATCH_RUN',
    (f) => {
      f.state.run.path = '.github/workflows/other.yaml';
    },
  ],
  [
    'PUBLIC_DISPATCH_WORKFLOW',
    (f) => {
      f.state.workflow.id = 24;
    },
  ],
  [
    'PUBLIC_DISPATCH_WORKFLOW',
    (f) => {
      f.state.workflow.state = 'disabled_manually';
    },
  ],
  [
    'PUBLIC_DISPATCH_ACTOR',
    (f) => {
      f.context.actor = 'different-operator';
    },
  ],
  [
    'PUBLIC_DISPATCH_OPERATOR',
    (f) => {
      f.state.run.triggering_actor = null;
    },
  ],
  [
    'PUBLIC_DISPATCH_PERMISSION',
    (f) => {
      f.state.permissions.operator.permission = 'read';
    },
  ],
  [
    'PUBLIC_DISPATCH_PERMISSION',
    (f) => {
      f.state.permissions.rerunner.permission = 'triage';
    },
  ],
  [
    'PUBLIC_DISPATCH_PERMISSION',
    (f) => {
      f.state.permissions.operator = {
        permission: 'admin',
        user: { id: 99, login: 'operator', type: 'User' },
      };
    },
  ],
  [
    'PUBLIC_DISPATCH_COMMIT',
    (f) => {
      f.state.commit = () => ({ sha: main });
    },
  ],
  [
    'PUBLIC_DISPATCH_ANCESTRY',
    (f) => {
      f.state.compare = (ref) => ({
        status: 'diverged',
        merge_base_commit: { sha: ref },
      });
    },
  ],
  [
    'PUBLIC_DISPATCH_ANCESTRY',
    (f) => {
      f.state.compare = () => ({
        status: 'ahead',
        merge_base_commit: { sha: main },
      });
    },
  ],
  [
    'PUBLIC_DISPATCH_POLICY_DRIFT',
    (f) => {
      f.state.content = ({ ref, path }) => ({
        type: 'file',
        sha:
          ref === main && path.endsWith('trusted-public-receipts.js')
            ? 'e'.repeat(40)
            : blob,
      });
    },
  ],
  [
    'PUBLIC_DISPATCH_POLICY_DRIFT',
    (f) => {
      f.state.content = () => ({ type: 'dir', sha: blob });
    },
  ],
];
for (const [index, [code, mutate]] of mutations.entries()) {
  test(`rejects mismatched dispatch evidence ${index}: ${code}`, async () => {
    const fixture = dispatchFixture();
    mutate(fixture);
    await assert.rejects(
      admitDispatch(fixture.options),
      (error) =>
        error instanceof PublicAdmissionError &&
        error.code === code &&
        error.phase === 'dispatch-admission'
    );
  });
}

test('invalid SHA and context fail before any API call', async () => {
  for (const field of ['sourceSha', 'controlSha']) {
    const fixture = dispatchFixture();
    fixture.options[field] = 'main';
    await assert.rejects(admitDispatch(fixture.options), /PUBLIC_DISPATCH_SHA/);
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = dispatchFixture();
  fixture.context.eventName = 'pull_request_target';
  await assert.rejects(
    admitDispatch(fixture.options),
    /PUBLIC_DISPATCH_CONTEXT/
  );
  assert.equal(fixture.calls.length, 0);
});

test('a caller-selected older merged commit is rejected before API access', async () => {
  const fixture = dispatchFixture();
  fixture.options.sourceSha = 'e'.repeat(40);
  await assert.rejects(admitDispatch(fixture.options), {
    code: 'PUBLIC_DISPATCH_SOURCE_IDENTITY',
    phase: 'dispatch-admission',
  });
  assert.equal(fixture.calls.length, 0);
});

test('controls from a different commit cannot authorize the dispatch run', async () => {
  const fixture = dispatchFixture();
  fixture.options.controlSha = 'b'.repeat(40);
  await assert.rejects(admitDispatch(fixture.options), {
    code: 'PUBLIC_DISPATCH_RUN',
    phase: 'dispatch-admission',
  });
  assert.equal(
    fixture.calls.some((call) => call.method === 'content'),
    false
  );
});

test('API failures expose only a stable phase and code', async () => {
  const fixture = dispatchFixture();
  fixture.github.rest.repos.get = async () => {
    throw new Error('fixture private response');
  };
  await assert.rejects(
    admitDispatch(fixture.options),
    (error) =>
      error.code === 'PUBLIC_DISPATCH_API' &&
      error.message === 'PUBLIC_DISPATCH_API' &&
      error.phase === 'dispatch-admission'
  );
});
