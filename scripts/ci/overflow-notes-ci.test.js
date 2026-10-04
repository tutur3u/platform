const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const {
  NOTES_REF,
  isValidatedOverflowNotesPush,
} = require('./overflow-notes-ci');
const {
  buildReleaseNotesDocument,
} = require('./release-please-overflow-recovery-core');
const { readWorkflow } = require('./workflow-yaml-test-helper');

test('validates exact committed notes delta against production, retaining all unknown work', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'overflow-notes-ci-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    git('init');
    git('config', 'user.name', 'Synthetic');
    git('config', 'user.email', 'synthetic@example.invalid');
    fs.writeFileSync(path.join(root, 'source.ts'), 'base');
    git('add', '.');
    git('commit', '-m', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    git('update-ref', 'refs/remotes/origin/production', base);
    const env = {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: NOTES_REF,
      GITHUB_SHA: base,
    };
    assert.equal(isValidatedOverflowNotesPush(env, git), true);
    fs.writeFileSync(
      path.join(root, 'release-notes.md'),
      buildReleaseNotesDocument([
        {
          component: 'platform',
          version: '1.0.0',
          notes: '## Synthetic changes\n- test',
        },
      ])
    );
    git('add', '.');
    git('commit', '-m', 'notes');
    env.GITHUB_SHA = git('rev-parse', 'HEAD').trim();
    assert.equal(isValidatedOverflowNotesPush(env, git), true);
    assert.equal(
      isValidatedOverflowNotesPush(
        { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' },
        git
      ),
      false
    );
    for (const ref of [
      'refs/heads/main',
      'refs/heads/production',
      'refs/heads/release-please--branches--production',
      'refs/heads/release-please--branches--main--release-notes',
    ])
      assert.equal(
        isValidatedOverflowNotesPush({ ...env, GITHUB_REF: ref }, git),
        false
      );
    fs.writeFileSync(path.join(root, 'source.ts'), 'changed');
    git('add', '.');
    git('commit', '-m', 'source');
    env.GITHUB_SHA = git('rev-parse', 'HEAD').trim();
    assert.equal(isValidatedOverflowNotesPush(env, git), false);
    fs.writeFileSync(path.join(root, 'source.ts'), 'base');
    fs.writeFileSync(path.join(root, 'release-notes.md'), 'arbitrary notes');
    git('add', '.');
    git('commit', '-m', 'malformed');
    env.GITHUB_SHA = git('rev-parse', 'HEAD').trim();
    assert.equal(isValidatedOverflowNotesPush(env, git), false);
    git('update-ref', '-d', 'refs/remotes/origin/production');
    assert.equal(
      isValidatedOverflowNotesPush({ ...env, GITHUB_SHA: base }, git),
      false
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('shared, inline and E2E preflights validate notes rather than trusting ref names', () => {
  for (const name of ['ci-check.yml', 'type-check.yaml']) {
    const workflow = readWorkflow(name);
    const steps = Object.values(workflow.jobs)[0].steps;
    const config = steps.find((step) => step.id === 'check_config');
    assert.match(config.run, /node scripts\/ci\/overflow-notes-ci.js/);
    assert.match(config.run, /should_run=false/);
  }
  const e2e = readWorkflow('e2e-tests.yaml');
  assert.match(
    e2e.jobs.relevance.steps.find((step) => step.id === 'detect').run,
    /overflow-notes-ci.js[\s\S]+run_e2e=false/
  );
  for (const name of [
    'codecov.yaml',
    'turbo-unit-tests.yaml',
    'e2e-tests.yaml',
    'biome-check.yaml',
    'supabase-baseline.yaml',
  ]) {
    assert.ok(
      readWorkflow(name).concurrency['cancel-in-progress'].includes(
        `github.ref != '${NOTES_REF}'`
      )
    );
    assert.ok(
      readWorkflow(name).concurrency.group.includes(
        `github.ref == '${NOTES_REF}' && github.sha || github.ref`
      ),
      `${name}: notes pending runs need unique commit groups`
    );
  }
  assert.equal(readWorkflow('biome-check.yaml').on.push, null);
});
