const assert = require('node:assert/strict');
const { installFetchFixture } = require('./staging-workflow-fixture.cjs');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../.github/workflows/supabase-production.yaml'
  ),
  'utf8'
);
const productionSha = 'a'.repeat(40);
const stagingSha = 'b'.repeat(40);
const workflowSha = 'c'.repeat(40);

function stepScript(name, source = workflow) {
  const block = source.split(`      - name: ${name}\n`)[1];
  assert.ok(block, `missing workflow step ${name}`);
  const script = block.split('        run: |\n')[1];
  assert.ok(script, `missing shell body for ${name}`);
  return script
    .split('\n')
    .slice(
      0,
      script
        .split('\n')
        .findIndex((line) => line && !line.startsWith('          '))
    )
    .map((line) => line.slice(10))
    .join('\n')
    .replaceAll(/\$\{\{ github\.repository \}\}/g, 'example/platform');
}

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-target-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, 'requests');
  const output = path.join(directory, 'output');
  const environment = path.join(directory, 'environment');
  fs.writeFileSync(output, '');
  fs.writeFileSync(environment, '');
  fs.symlinkSync(process.execPath, path.join(directory, 'node'));
  const preload = path.join(directory, 'fetch.cjs');
  const blobFile = path.join(directory, 'blobs.json');
  const contracts = [
    [
      '.github/workflows/supabase-staging.yaml',
      '74fb269fcc135b0467c19d82286f1c3484c7d4f7',
    ],
    [
      'scripts/ci/record-deployment-marker.ts',
      '35eaf73931589cfe9dd62f7456a3dbe3c48c988c',
    ],
    [
      '.github/workflows/supabase-staging.yaml',
      'c80066e1cd038fcda3bd6c1a79c0b12993b94b49',
      true,
    ],
    [
      '.github/workflows/supabase-staging.yaml',
      '40f1cc37c1b4c0ed2b9976019c95eb145311c77d',
      false,
      true,
    ],
  ].map(([file, sha, legacy = false, previous = false]) => {
    const bytes = fs.readFileSync(
      legacy
        ? path.join(__dirname, 'supabase-staging-legacy.yaml')
        : previous
          ? path.join(__dirname, 'supabase-staging-before-main-push.yaml')
          : path.resolve(__dirname, '../../..', file)
    );
    const actual = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    assert.equal(actual, sha, `shipped contract changed: ${file}`);
    return {
      path: file,
      sha,
      bytes: bytes.toString('base64'),
      legacy,
      kind: legacy ? 'old' : previous ? 'previous' : 'new',
    };
  });
  fs.writeFileSync(blobFile, JSON.stringify(contracts));
  fs.writeFileSync(preload, `(${installFetchFixture.toString()})();\n`);
  fs.writeFileSync(
    path.join(directory, 'gh'),
    `#!${process.execPath}
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const request = process.argv[3];
let response;
fs.appendFileSync(process.env.REQUEST_LOG, request + '\\n');
if (process.env.API_FAILURE === 'true') process.exit(1);
const sha = process.env.PRODUCTION_SHA;
if (request.endsWith('/git/ref/heads/production')) {
  response = {object: {type: process.env.PRODUCTION_TYPE, sha}};
} else if (request.includes('/actions/workflows/')) {
  if (!request.includes('head_sha=' + sha)) process.exit(9);
  const staging = request.includes('supabase-staging');
  response = {workflow_runs: [{
    head_sha: staging ? process.env.STAGING_SHA : process.env.PLANNER_SHA,
    head_branch: staging ? process.env.STAGING_BRANCH : process.env.PLANNER_BRANCH,
    conclusion: staging ? process.env.STAGING_RESULT : process.env.PLANNER_RESULT,
    status: staging ? process.env.STAGING_STATUS : 'completed'
  }]};
} else if (request.includes('/deployments?')) {
  const marker = (id, markerSha, created_at, payload = {}) => ({
    id, sha: markerSha, created_at, payload: {
      sha: markerSha, markerKind: 'deployment',
      workflowName: 'vercel-production-platform.yaml', ...payload
    }
  });
  response = [
    marker(99, process.env.UNRELATED_SHA, '2026-01-05'),
    marker(16, process.env.MARKER_SHA, '2026-01-01'),
    marker(17, process.env.MARKER_SHA, '2026-01-02'),
    marker(98, sha, '2026-01-04', {workflowName: 'other-workflow.yaml'}),
    marker(97, sha, '2026-01-03', {markerKind: 'build'}),
  ];
  if (process.env.MARKER_PAYLOAD === 'empty') {
    response = [{id: 17, sha, created_at: '2026-01-06', payload: {}}];
  } else if (process.env.MARKER_PAYLOAD === 'wrong-sha') {
    response = [marker(17, sha, '2026-01-06', {sha: process.env.UNRELATED_SHA})];
  } else {
    response.push({id: 96, sha, created_at: '2026-01-06', payload: {}});
  }
} else if (request.endsWith('/deployments/17/statuses')) {
  response = [{state: process.env.MARKER_STATE}];
  if (process.env.OLD_SUCCESS === 'true') response.push({state: 'success'});
} else process.exit(8);
const projection = process.argv.indexOf('--jq');
const json = JSON.stringify(response);
process.stdout.write(projection < 0 ? json : execFileSync('jq',
  ['-rc', process.argv[projection + 1]], {input: json, encoding: 'utf8'}));
`,
    { mode: 0o755 }
  );
  const env = {
    ...process.env,
    PATH: `${directory}${path.delimiter}${process.env.PATH}`,
    GITHUB_OUTPUT: output,
    GITHUB_ENV: environment,
    REQUEST_LOG: log,
    GH_TOKEN: 'synthetic-test-only',
    REPOSITORY: 'example/platform',
    GITHUB_REPOSITORY: 'example/platform',
    GITHUB_API_URL: 'https://api.github.com',
    GITHUB_SERVER_URL: 'https://github.com',
    NODE_OPTIONS: `--require=${preload}`,
    FIXTURE_BLOBS: blobFile,
    TARGET_CONTRACT: 'previous',
    WRAPPER_CONTRACT: 'previous',
    FIXTURE_WRAPPER_SHA: workflowSha,
    ALLOW_CLOUDFLARE_VERIFICATION_FAILURES: 'false',
    EXPECTED_SHA: '',
    CURRENT_SHA: productionSha,
    UNRELATED_SHA: stagingSha,
    CURRENT_REF_NAME: 'main',
    EVENT_NAME: 'workflow_run',
    TRIGGER_BRANCH: 'main',
    TRIGGER_CONCLUSION: 'success',
    TRIGGER_SHA: stagingSha,
    TRIGGER_WORKFLOW: 'Supabase Staging Migration',
    PRODUCTION_SHA: productionSha,
    PRODUCTION_TYPE: 'commit',
    DATABASE_AFFECTED: 'true',
    STAGING_RESULT: 'success',
    STAGING_SHA: productionSha,
    STAGING_BRANCH: 'main',
    PLANNER_SHA: productionSha,
    PLANNER_BRANCH: 'production',
    PLANNER_RESULT: 'success',
    MARKER_SHA: productionSha,
    STAGING_STATUS: 'completed',
    MARKER_STATE: 'success',
    ...overrides,
  };
  return {
    run(name, extra = {}) {
      return spawnSync('bash', ['-c', stepScript(name)], {
        env: { ...env, ...extra },
        encoding: 'utf8',
      });
    },
    output: () => fs.readFileSync(output, 'utf8'),
    requests: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''),
  };
}

module.exports = {
  fixture,
  workflow,
  productionSha,
  stagingSha,
  workflowSha,
  stepScript,
};
