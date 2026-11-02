const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// #7462 branched before #7394 added a migration and its reviewed ledger.
// Execute the workflow's actual base-selection shell against that graph.
for (const event of ['pull_request', 'push']) {
  test(`${event}: select the trusted comparison base`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-base-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.name', 'fixture');
    git('config', 'user.email', 'fixture@example.test');
    const commit = (file) => {
      fs.writeFileSync(path.join(root, file), file);
      git('add', file);
      git('commit', '-qm', file);
      return git('rev-parse', 'HEAD');
    };
    const oldBase = commit('base-834c125');
    git('branch', 'pr');
    const laterMain = commit('migration-and-ledger-7394');
    git('checkout', '-q', 'pr');
    commit('change-7462');
    git('checkout', '-q', '-');
    git('merge', '--no-ff', '-qm', 'tested merge', 'pr');
    const workflow = fs.readFileSync(
      path.join(__dirname, '../../.github/workflows/security-checks.yaml'),
      'utf8'
    );
    const step = workflow
      .split('      - name: Load trusted definer guard and baseline')[1]
      .split('      - name: Keep definer report')[0];
    const shell = step
      .split('        run: |\n')[1]
      .split('          dir=')[0]
      .replace(/^ {10}/gm, '');
    const selected = execFileSync(
      'bash',
      ['-c', `${shell}\nprintf '%s' "$BASE_SHA"`],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          EVENT_NAME: event,
          BASE_SHA: oldBase,
          GITHUB_SHA: git('rev-parse', 'HEAD'),
        },
      }
    );
    assert.equal(selected, event === 'pull_request' ? laterMain : oldBase);
  });
}
