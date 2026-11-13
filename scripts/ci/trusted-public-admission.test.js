const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  assessPullRequest,
  admitDispatch,
  LABEL,
} = require('./trusted-public-admission');
const source = 'a'.repeat(40),
  control = 'b'.repeat(40),
  main = 'c'.repeat(40);
function fixture() {
  const repo = {
    id: 42,
    full_name: 'tutur3u/platform',
    private: false,
    fork: false,
    default_branch: 'main',
  };
  const actor = { id: 7, login: 'fixture-operator', type: 'User' };
  const permission = { user: actor, permission: 'write' };
  const pr = {
    state: 'open',
    author_association: 'MEMBER',
    base: { ref: 'main', repo },
    head: { sha: source, repo: { ...repo } },
  };
  const workflowPath = '.github/workflows/public-build-artifact.yaml';
  const context = {
    repo: { owner: 'tutur3u', repo: 'platform' },
    runId: 123,
    actor: actor.login,
    ref: 'refs/heads/main',
    eventName: 'workflow_dispatch',
  };
  const run = {
    id: 123,
    repository: repo,
    head_repository: repo,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: control,
    path: workflowPath,
    actor,
    triggering_actor: actor,
  };
  const records = {
    repo,
    actor,
    permission,
    pr,
    expectedSha: source,
    run,
    context,
    workflowPath,
    sourceSha: source,
    controlSha: control,
  };
  records.github = {
    rest: {
      actions: { getWorkflowRun: async () => ({ data: run }) },
      repos: {
        get: async () => ({ data: repo }),
        getCollaboratorPermissionLevel: async () => ({ data: permission }),
        getBranch: async () => ({ data: { commit: { sha: main } } }),
        getCommit: async ({ ref }) => ({ data: { sha: ref } }),
        compareCommitsWithBasehead: async ({ basehead }) => ({
          data: {
            status: 'ahead',
            merge_base_commit: { sha: basehead.split('...')[0] },
          },
        }),
        getContent: async () => ({
          data: { type: 'file', sha: 'd'.repeat(40) },
        }),
      },
    },
  };
  return records;
}
test('same-repository trusted PR qualifies only as a held candidate', () => {
  assert.deepEqual(assessPullRequest(fixture()), {
    qualified: true,
    selfHosted: false,
    label: LABEL,
    reason: 'attachment-held',
  });
});
const negatives = {
  fork: (f) => {
    f.pr.head.repo.id = 9;
    f.pr.head.repo.fork = true;
  },
  'forged repo': (f) => {
    f.pr.head.repo.full_name = 'forged/platform';
  },
  'forged actor': (f) => {
    f.actor.id = 9;
    f.permission = { user: { id: 7 }, permission: 'write' };
  },
  'missing actor': (f) => {
    f.actor = undefined;
  },
  'unknown association': (f) => {
    f.pr.author_association = 'CONTRIBUTOR';
  },
  'missing association': (f) => {
    delete f.pr.author_association;
  },
  'moved head': (f) => {
    f.pr.head.sha = main;
  },
  'malformed SHA': (f) => {
    f.expectedSha = source + '\n';
  },
  'default branch': (f) => {
    f.repo.default_branch = 'other';
  },
  'missing permission': (f) => {
    f.permission = undefined;
  },
};
for (const [name, mutate] of Object.entries(negatives))
  test(`PR refusal: ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => assessPullRequest(f), /denied/);
  });
test('manual dispatch uses repository records and remains hosted', async () => {
  assert.equal((await admitDispatch(fixture())).selfHosted, false);
});
const dispatchNegatives = {
  'fork run': (f) => {
    f.run.head_repository = { id: 9 };
  },
  'forged run actor': (f) => {
    f.context.actor = 'impostor';
  },
  'untrusted rerun operator': (f) => {
    f.run.triggering_actor = { id: 8, login: 'impostor', type: 'User' };
  },
  'read-only operator': (f) => {
    f.permission.permission = 'read';
  },
  'moved control SHA': (f) => {
    f.run.head_sha = main;
  },
  'missing API': (f) => {
    f.github.rest.repos.get = async () => {
      throw new Error('API unavailable');
    };
  },
  'modified workflow': (f) => {
    f.run.path = '.github/workflows/other.yaml';
  },
  'workflow drift': (f) => {
    f.github.rest.repos.getContent = async ({ ref }) => ({
      data: { type: 'file', sha: ref },
    });
  },
  'missing blob evidence': (f) => {
    f.github.rest.repos.getContent = async () => ({ data: {} });
  },
  'default-branch policy': (f) => {
    f.repo.default_branch = 'other';
  },
  'wrong commit record': (f) => {
    f.github.rest.repos.getCommit = async () => ({ data: { sha: main } });
  },
  'unmerged source': (f) => {
    f.github.rest.repos.compareCommitsWithBasehead = async () => ({
      data: { status: 'diverged' },
    });
  },
  pull_request_target: (f) => {
    f.context.eventName = 'pull_request_target';
  },
};
for (const [name, mutate] of Object.entries(dispatchNegatives))
  test(`dispatch refusal: ${name}`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(admitDispatch(f));
  });
for (const name of ['public-merged-main-tests', 'public-build-artifact']) {
  test(`${name}: actual workflow seam invokes the helper before source checkout`, async () => {
    const text = fs.readFileSync(
      `${__dirname}/../../.github/workflows/${name}.yaml`,
      'utf8'
    );
    const script = text.match(
      /\/\/ trusted-public:start\n([\s\S]*?)\/\/ trusted-public:end/
    )[1];
    const f = fixture();
    f.workflowPath = `.github/workflows/${name}.yaml`;
    f.run.path = f.workflowPath;
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    let invoked = false;
    const requireFixture = (p) =>
      p === 'node:child_process'
        ? { execFileSync: () => control + '\n' }
        : {
            admitDispatch: async (args) => {
              invoked = true;
              return admitDispatch(args);
            },
          };
    await new AsyncFunction(
      'require',
      'github',
      'context',
      'process',
      'core',
      script
    )(
      requireFixture,
      f.github,
      f.context,
      {
        env: {
          CONTROL_SHA: control,
          SOURCE_SHA: source,
          GITHUB_WORKSPACE: '/fixture',
        },
      },
      { info: () => {} }
    );
    assert.equal(invoked, true);
    assert.ok(
      text.indexOf('// trusted-public:start') <
        text.indexOf('- name: Checkout admitted source')
    );
    assert.ok(
      !/secrets[.:]|secrets: inherit|pull_request_target|self-hosted|ttr-trusted-studio|environment:/.test(
        text
      )
    );
    assert.match(text, /permissions:\n  contents: read/);
    for (const match of text.matchAll(/runs-on: (.*)/g))
      assert.equal(match[1], 'ubuntu-latest');
    for (const match of text.matchAll(/uses: ([^\n ]+)/g))
      assert.match(match[1], /^[\w/-]+@[a-f0-9]{40}$/);
  });
}
