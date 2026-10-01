const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(
  path.join(repoRoot, '.github/workflows/vercel-preview-learn.yaml'),
  'utf8'
);

test('Learn build source output comes from actual checkout, not dispatch SHA or input shell', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-source-'));
  try {
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q');
    git(
      '-c',
      'user.name=Synthetic',
      '-c',
      'user.email=synthetic@example.test',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture'
    );
    const expected = git('rev-parse', 'HEAD');
    git(
      '-c',
      'user.name=Synthetic',
      '-c',
      'user.email=synthetic@example.test',
      'commit',
      '--allow-empty',
      '-qm',
      'dispatch main fixture'
    );
    const dispatchSha = git('rev-parse', 'HEAD');
    git('checkout', '--detach', '-q', expected);
    assert.notEqual(expected, dispatchSha);
    const output = path.join(root, 'output');
    const block = workflow.match(
      / {6}- name: Confirm preview ref[\s\S]*? {8}run: \|\n([\s\S]*?)\n {6}- name:/
    )[1];
    const script = block
      .split('\n')
      .map((line) => line.slice(10))
      .join('\n');
    assert.doesNotMatch(script, /\$\{\{/);
    execFileSync('bash', ['-e', '-c', script], {
      cwd: root,
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        GITHUB_SHA: dispatchSha,
      },
    });
    assert.match(
      fs.readFileSync(output, 'utf8'),
      new RegExp(`source_sha=${expected}`)
    );
    assert.match(workflow, /ref: \$\{\{ inputs.preview_ref \}\}/);
    assert.match(
      workflow,
      /VERCEL_MARKER_SHA: \$\{\{ steps.check_commits.outputs.source_sha \}\}/
    );
    assert.match(workflow, /timeout-minutes: 35/);
    assert.match(workflow, /TURBO_CONCURRENCY: "2"/);
    assert.doesNotMatch(workflow, /\bvercel deploy\b/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recorder sends an exact source build marker, not a deployment or main dispatch SHA', () => {
  const result = execFileSync(
    'node',
    [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `
      const requests = [];
      globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ id: 1, statuses_url: 'https://api.example.test/statuses/1' }) };
      };
      const { main } = await import('./scripts/ci/record-vercel-deployment.ts');
      await main();
      console.log(JSON.stringify(requests));
    `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: 'synthetic',
        GITHUB_REPOSITORY: 'synthetic/repo',
        GITHUB_SHA: 'dispatch-main-sha',
        VERCEL_MARKER_SHA: 'checked-out-source-sha',
        VERCEL_WORKFLOW_NAME: 'vercel-preview-learn.yaml',
        VERCEL_MARKER_KIND: 'build',
        GITHUB_API_URL: 'https://api.example.test',
      },
    }
  );
  const [marker, status] = JSON.parse(result.trim().split('\n').at(-1));
  assert.equal(marker.body.ref, 'checked-out-source-sha');
  assert.equal(marker.body.payload.sha, 'checked-out-source-sha');
  assert.equal(marker.body.payload.markerKind, 'build');
  assert.equal(marker.body.production_environment, false);
  assert.equal(marker.body.transient_environment, true);
  assert.equal(status.body.state, 'success');
  assert.match(status.body.description, /build/);
});
