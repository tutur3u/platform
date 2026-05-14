const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, runGitSync } = require('./git-sync.js');

const MAIN_SHA = 'a'.repeat(40);
const STAGING_SHA = 'b'.repeat(40);
const PRODUCTION_SHA = 'c'.repeat(40);
const FEATURE_SHA = 'd'.repeat(40);

const sink = { write() {} };

function createFakeGit({
  ancestors = [
    [STAGING_SHA, MAIN_SHA],
    [PRODUCTION_SHA, MAIN_SHA],
  ],
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
    'refs/heads/staging': STAGING_SHA,
    'refs/remotes/origin/main': MAIN_SHA,
    'refs/remotes/origin/production': PRODUCTION_SHA,
    'refs/remotes/origin/staging': STAGING_SHA,
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
      'staging',
      '--only-branch=production',
      '--no-push',
    ]),
    {
      help: false,
      push: false,
      selectedBranches: ['staging', 'production'],
    }
  );
});

test('parseArgs accepts comma-separated branch scopes', () => {
  assert.deepEqual(parseArgs(['--only-branch=staging,production']), {
    help: false,
    push: true,
    selectedBranches: ['staging', 'production'],
  });
});

test('parseArgs rejects unknown branch scopes', () => {
  assert.throws(
    () => parseArgs(['--only-branch', 'preview']),
    /Unsupported branch "preview"/
  );
});

test('parseArgs rejects empty branch scopes', () => {
  assert.throws(
    () => parseArgs(['--only-branch=,']),
    /Missing value after --only-branch/
  );
});

test('runGitSync fast-forwards staging and production to main and pushes all branches', () => {
  const git = createFakeGit();

  const result = runGitSync({
    execFile: git.execFile,
    stderr: sink,
    stdout: sink,
  });

  assert.equal(result.mainSha, MAIN_SHA);
  assert.deepEqual(result.selectedBranches, ['main', 'staging', 'production']);
  assert.deepEqual(result.pushedBranches, ['main', 'staging', 'production']);
  assert.equal(git.currentBranch, 'feature/work');
  assert.equal(git.refs['refs/heads/main'], MAIN_SHA);
  assert.equal(git.refs['refs/heads/staging'], MAIN_SHA);
  assert.equal(git.refs['refs/heads/production'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/main'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/staging'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/production'], MAIN_SHA);
  assert.deepEqual(
    git.calls.filter((args) => args[0] === 'push'),
    [
      ['push', 'origin', 'main'],
      ['push', 'origin', 'staging'],
      ['push', 'origin', 'production'],
    ]
  );
});

test('runGitSync can sync only staging', () => {
  const git = createFakeGit();

  const result = runGitSync({
    execFile: git.execFile,
    selectedBranches: ['staging'],
    stderr: sink,
    stdout: sink,
  });

  assert.deepEqual(result.selectedBranches, ['staging']);
  assert.deepEqual(result.pushedBranches, ['staging']);
  assert.equal(git.refs['refs/heads/staging'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/staging'], MAIN_SHA);
  assert.equal(git.refs['refs/heads/production'], PRODUCTION_SHA);
  assert.equal(git.refs['refs/remotes/origin/production'], PRODUCTION_SHA);
  assert.deepEqual(
    git.calls.filter((args) => args[0] === 'push'),
    [['push', 'origin', 'staging']]
  );
  assert.equal(
    git.calls.some(
      (args) => args[0] === 'checkout' && args[1] === 'production'
    ),
    false
  );
});

test('runGitSync can update local branches without pushing', () => {
  const git = createFakeGit();

  const result = runGitSync({
    execFile: git.execFile,
    push: false,
    stderr: sink,
    stdout: sink,
  });

  assert.deepEqual(result.pushedBranches, []);
  assert.equal(git.refs['refs/heads/main'], MAIN_SHA);
  assert.equal(git.refs['refs/heads/staging'], MAIN_SHA);
  assert.equal(git.refs['refs/heads/production'], MAIN_SHA);
  assert.equal(git.refs['refs/remotes/origin/staging'], STAGING_SHA);
  assert.equal(git.refs['refs/remotes/origin/production'], PRODUCTION_SHA);
  assert.equal(
    git.calls.some((args) => args[0] === 'push'),
    false
  );
});

test('runGitSync refuses to run with a dirty worktree', () => {
  const git = createFakeGit({ status: ' M package.json\n?? tmp-file\n' });

  assert.throws(
    () =>
      runGitSync({
        execFile: git.execFile,
        stderr: sink,
        stdout: sink,
      }),
    /requires a clean worktree/
  );
  assert.equal(
    git.calls.some((args) => args[0] === 'fetch'),
    false
  );
  assert.equal(git.currentBranch, 'feature/work');
});

test('runGitSync refuses target branches that cannot fast-forward to main', () => {
  const stagingOnlySha = 'e'.repeat(40);
  const git = createFakeGit({
    ancestors: [[PRODUCTION_SHA, MAIN_SHA]],
    refs: {
      'refs/heads/staging': stagingOnlySha,
      'refs/remotes/origin/staging': stagingOnlySha,
    },
  });

  assert.throws(
    () =>
      runGitSync({
        execFile: git.execFile,
        stderr: sink,
        stdout: sink,
      }),
    /staging cannot fast-forward to main/
  );
  assert.equal(git.currentBranch, 'feature/work');
  assert.equal(git.refs['refs/heads/staging'], stagingOnlySha);
  assert.equal(
    git.calls.some((args) => args[0] === 'push' && args[2] === 'staging'),
    false
  );
});

test('runGitSync creates missing local release branches from origin tracking refs', () => {
  const git = createFakeGit({
    refs: {
      'refs/heads/production': undefined,
    },
  });

  runGitSync({
    execFile: git.execFile,
    stderr: sink,
    stdout: sink,
  });

  assert.deepEqual(
    git.calls.filter((args) => args[0] === 'branch' && args[1] === '--track'),
    [['branch', '--track', 'production', 'origin/production']]
  );
  assert.equal(git.refs['refs/heads/production'], MAIN_SHA);
});
