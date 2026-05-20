const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, runGitSync } = require('./git-sync.js');

const MAIN_SHA = 'a'.repeat(40);
const PRODUCTION_SHA = 'c'.repeat(40);
const FEATURE_SHA = 'd'.repeat(40);

const sink = { write() {} };
const TEST_WORKTREE_PATH = '/tmp/tuturuuu-git-sync-test';

function runFakeGitSync(git, options = {}) {
  return runGitSync({
    execFile: git.execFile,
    makeTempDir: () => TEST_WORKTREE_PATH,
    removeDir() {},
    stderr: sink,
    stdout: sink,
    tempRoot: '/tmp',
    ...options,
  });
}

function createFakeGit({
  ancestors = [[PRODUCTION_SHA, MAIN_SHA]],
  currentBranch = 'feature/work',
  refs = {},
  status = '',
} = {}) {
  let current = currentBranch;
  const calls = [];
  const ancestorSet = new Set(ancestors.map(([base, tip]) => `${base}:${tip}`));
  const gitRefs = {
    'refs/heads/feature/work': FEATURE_SHA,
    'refs/heads/main': MAIN_SHA,
    'refs/heads/production': PRODUCTION_SHA,
    'refs/remotes/origin/main': MAIN_SHA,
    'refs/remotes/origin/production': PRODUCTION_SHA,
    ...refs,
  };

  function localRef(branch) {
    return `refs/heads/${branch}`;
  }

  function remoteRef(remote, branch) {
    return `refs/remotes/${remote}/${branch}`;
  }

  function resolveRef(ref) {
    if (ref === 'HEAD') {
      return gitRefs[localRef(current)];
    }

    if (/^[0-9a-f]{40}$/.test(ref)) {
      return ref;
    }

    if (ref.startsWith('origin/')) {
      return gitRefs[remoteRef('origin', ref.slice('origin/'.length))];
    }

    return gitRefs[localRef(ref)] ?? gitRefs[ref];
  }

  function canFastForward(fromSha, toSha) {
    return fromSha === toSha || ancestorSet.has(`${fromSha}:${toSha}`);
  }

  function canAlreadyContain(localSha, remoteSha) {
    return (
      localSha === remoteSha || ancestorSet.has(`${remoteSha}:${localSha}`)
    );
  }

  function execFile(command, args) {
    assert.equal(command, 'git');
    calls.push(args);

    if (args[0] === 'branch' && args[1] === '--show-current') {
      return `${current}\n`;
    }

    if (args[0] === 'status' && args[1] === '--porcelain=v1') {
      return status;
    }

    if (args[0] === 'fetch') {
      return '';
    }

    if (args[0] === 'worktree' && args[1] === 'add') {
      assert.deepEqual(args, [
        'worktree',
        'add',
        '--detach',
        TEST_WORKTREE_PATH,
        'origin/main',
      ]);
      return '';
    }

    if (args[0] === 'worktree' && args[1] === 'remove') {
      assert.deepEqual(args, [
        'worktree',
        'remove',
        '--force',
        TEST_WORKTREE_PATH,
      ]);
      return '';
    }

    if (args[0] === 'show-ref' && args[1] === '--verify') {
      if (!gitRefs[args[3]]) {
        throw new Error(`missing ref ${args[3]}`);
      }
      return '';
    }

    if (args[0] === 'branch' && args[1] === '--track') {
      const branch = args[2];
      const remoteBranch = args[3];
      gitRefs[localRef(branch)] = resolveRef(remoteBranch);
      return '';
    }

    if (args[0] === 'branch' && args[1] === '--force') {
      const branch = args[2];
      const targetSha = resolveRef(args[3]);
      if (!targetSha) {
        throw new Error(`missing revision ${args[3]}`);
      }
      if (branch === current && gitRefs[localRef(branch)] !== targetSha) {
        throw new Error(`cannot force update checked out branch ${branch}`);
      }
      gitRefs[localRef(branch)] = targetSha;
      return '';
    }

    if (args[0] === 'checkout') {
      const branch = args[1];
      if (!gitRefs[localRef(branch)]) {
        throw new Error(`missing branch ${branch}`);
      }
      current = branch;
      return '';
    }

    if (args[0] === 'pull' && args[1] === '--ff-only') {
      const remote = args[2];
      const branch = args[3];
      const localSha = gitRefs[localRef(branch)];
      const remoteSha = gitRefs[remoteRef(remote, branch)];
      if (!localSha || !remoteSha) {
        throw new Error(`missing ${branch}`);
      }
      if (canFastForward(localSha, remoteSha)) {
        gitRefs[localRef(branch)] = remoteSha;
        return '';
      }
      if (canAlreadyContain(localSha, remoteSha)) {
        return '';
      }
      throw new Error(`${branch} cannot pull ${remote}/${branch}`);
    }

    if (args[0] === 'rev-parse') {
      const sha = resolveRef(args[1]);
      if (!sha) {
        throw new Error(`missing revision ${args[1]}`);
      }
      return `${sha}\n`;
    }

    if (args[0] === 'push') {
      const remote = args[1];
      const branch = args[2];
      gitRefs[remoteRef(remote, branch)] = gitRefs[localRef(branch)];
      return '';
    }

    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      const baseSha = resolveRef(args[2]);
      const tipSha = resolveRef(args[3]);
      if (canFastForward(baseSha, tipSha)) {
        return '';
      }
      throw new Error(`${args[2]} is not an ancestor of ${args[3]}`);
    }

    if (args[0] === 'merge' && args[1] === '--ff-only') {
      const currentSha = resolveRef('HEAD');
      const targetSha = resolveRef(args[2]);
      if (!canFastForward(currentSha, targetSha)) {
        throw new Error(`cannot fast-forward to ${args[2]}`);
      }
      gitRefs[localRef(current)] = targetSha;
      return '';
    }

    throw new Error(`unexpected git command: ${args.join(' ')}`);
  }

  return {
    calls,
    execFile,
    get currentBranch() {
      return current;
    },
    refs: gitRefs,
  };
}

test('parseArgs supports branch scoping and local-only mode', () => {
  assert.deepEqual(
    parseArgs([
      '--only-branch',
      'main',
      '--only-branch=production',
      '--no-push',
    ]),
    {
      help: false,
      push: false,
      selectedBranches: ['main', 'production'],
    }
  );
});

test('parseArgs accepts comma-separated branch scopes', () => {
  assert.deepEqual(parseArgs(['--only-branch=main,production']), {
    help: false,
    push: true,
    selectedBranches: ['main', 'production'],
  });
});

test('parseArgs rejects unknown branch scopes', () => {
  assert.throws(
    () => parseArgs(['--only-branch', 'preview']),
    /Unsupported branch "preview"/
  );
});

test('parseArgs rejects retired staging branch scopes', () => {
  assert.throws(
    () => parseArgs(['--only-branch', 'staging']),
    /Branch "staging" is retired/
  );
});

test('parseArgs rejects empty branch scopes', () => {
  assert.throws(
    () => parseArgs(['--only-branch=,']),
    /Missing value after --only-branch/
  );
});

test('runGitSync fast-forwards production to main and pushes active branches', () => {
  const git = createFakeGit();

  const result = runFakeGitSync(git);

  assert.equal(result.mainSha, MAIN_SHA);
  assert.deepEqual(result.selectedBranches, ['main', 'production']);
  assert.deepEqual(result.pushedBranches, ['main', 'production']);
  assert.equal(git.currentBranch, 'feature/work');
  assert.equal(git.refs['refs/heads/main'], MAIN_SHA);
  assert.equal(git.refs['refs/heads/production'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/main'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/production'], MAIN_SHA);
  assert.deepEqual(
    git.calls.filter((args) => args[0] === 'push'),
    [
      ['push', 'origin', 'main'],
      ['push', 'origin', 'production'],
    ]
  );
  assert.deepEqual(
    git.calls.filter((args) => args[0] === 'worktree'),
    [
      ['worktree', 'add', '--detach', TEST_WORKTREE_PATH, 'origin/main'],
      ['worktree', 'remove', '--force', TEST_WORKTREE_PATH],
    ]
  );
});

test('runGitSync ignores missing legacy staging refs', () => {
  const git = createFakeGit({
    refs: {
      'refs/heads/staging': undefined,
      'refs/remotes/origin/staging': undefined,
    },
  });

  const result = runFakeGitSync(git);

  assert.deepEqual(result.selectedBranches, ['main', 'production']);
  assert.equal(
    git.calls.some((args) =>
      args.some((arg) => String(arg).includes('staging'))
    ),
    false
  );
});

test('runGitSync can sync only production', () => {
  const git = createFakeGit();

  const result = runFakeGitSync(git, {
    selectedBranches: ['production'],
  });

  assert.deepEqual(result.selectedBranches, ['production']);
  assert.deepEqual(result.pushedBranches, ['production']);
  assert.equal(git.refs['refs/heads/production'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/production'], MAIN_SHA);
  assert.deepEqual(
    git.calls.filter((args) => args[0] === 'push'),
    [['push', 'origin', 'production']]
  );
  assert.equal(
    git.calls.some((args) => args[0] === 'push' && args[2] === 'main'),
    false
  );
});

test('runGitSync can update local branches without pushing', () => {
  const git = createFakeGit();

  const result = runFakeGitSync(git, {
    push: false,
  });

  assert.deepEqual(result.pushedBranches, []);
  assert.equal(git.refs['refs/heads/main'], MAIN_SHA);
  assert.equal(git.refs['refs/heads/production'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/production'], PRODUCTION_SHA);
  assert.equal(
    git.calls.some((args) => args[0] === 'push'),
    false
  );
});

test('runGitSync leaves a dirty current worktree alone', () => {
  const git = createFakeGit({ status: ' M package.json\n?? tmp-file\n' });

  const result = runFakeGitSync(git);

  assert.equal(result.mainSha, MAIN_SHA);
  assert.equal(
    git.calls.some((args) => args[0] === 'status'),
    false
  );
  assert.equal(git.currentBranch, 'feature/work');
});

test('runGitSync refuses target branches that cannot fast-forward to main', () => {
  const productionOnlySha = 'e'.repeat(40);
  const git = createFakeGit({
    ancestors: [],
    refs: {
      'refs/heads/production': productionOnlySha,
      'refs/remotes/origin/production': productionOnlySha,
    },
  });

  assert.throws(
    () => runFakeGitSync(git),
    /production cannot fast-forward to main/
  );
  assert.equal(git.currentBranch, 'feature/work');
  assert.equal(git.refs['refs/heads/production'], productionOnlySha);
  assert.equal(
    git.calls.some((args) => args[0] === 'push' && args[2] === 'production'),
    false
  );
});

test('runGitSync creates missing local release branches from origin tracking refs', () => {
  const git = createFakeGit({
    refs: {
      'refs/heads/production': undefined,
    },
  });

  runFakeGitSync(git);

  assert.deepEqual(
    git.calls.filter((args) => args[0] === 'branch' && args[1] === '--track'),
    [['branch', '--track', 'production', 'origin/production']]
  );
  assert.equal(git.refs['refs/heads/production'], MAIN_SHA);
});
