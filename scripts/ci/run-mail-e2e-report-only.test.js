const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ADMISSION_ERROR,
  MAIL_URL,
  REPORT_RELATIVE_PATH,
  WORKFLOW_REF,
  assertMailE2EAdmission,
  buildMailRuntimeEnv,
  parseSupabaseEnv,
  playwrightArgs,
  summarizeReport,
} = require('./run-mail-e2e-report-only');

const trustedEnv = {
  CI: 'true',
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_WORKFLOW_REF: WORKFLOW_REF,
  GITHUB_REF: 'refs/heads/main',
  RUNNER_ENVIRONMENT: 'github-hosted',
  RUNNER_OS: 'Linux',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '1',
};

test('admission accepts trusted main push, schedule, and workflow_dispatch runs', () => {
  for (const eventName of ['push', 'schedule', 'workflow_dispatch']) {
    assert.doesNotThrow(() =>
      assertMailE2EAdmission({ ...trustedEnv, GITHUB_EVENT_NAME: eventName })
    );
  }
});

test('admission rejects pull requests, forks, non-main refs, and wrong workflow refs', () => {
  for (const overrides of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_EVENT_NAME: 'pull_request_target' },
    { GITHUB_REF: 'refs/heads/feature/test' },
    { GITHUB_REPOSITORY: 'fork/platform' },
    {
      GITHUB_WORKFLOW_REF:
        'tutur3u/platform/.github/workflows/other.yaml@refs/heads/main',
    },
    { RUNNER_ENVIRONMENT: 'self-hosted' },
    { GITHUB_RUN_ID: 'not-a-number' },
  ]) {
    assert.throws(
      () => assertMailE2EAdmission({ ...trustedEnv, ...overrides }),
      new RegExp(ADMISSION_ERROR)
    );
  }
});

test('parseSupabaseEnv extracts quoted and unquoted Supabase CLI env values', () => {
  const parsed = parseSupabaseEnv(`
API_URL="http://127.0.0.1:8001"
PUBLISHABLE_KEY="sb_publishable_test"
SECRET_KEY='sb_secret_test'
`);
  assert.deepEqual(parsed, {
    supabaseUrl: 'http://127.0.0.1:8001',
    publishableKey: 'sb_publishable_test',
    secretKey: 'sb_secret_test',
  });
  assert.throws(() => parseSupabaseEnv('API_URL="http://127.0.0.1:8001"'));
});

test('buildMailRuntimeEnv sets loopback production runtime flags and skips dev webServer', () => {
  const env = buildMailRuntimeEnv(
    {},
    {
      supabaseUrl: 'http://127.0.0.1:8001',
      publishableKey: 'pk-test',
      secretKey: 'sk-test',
    }
  );
  assert.equal(env.MAIL_E2E_BASE_URL, MAIL_URL);
  assert.equal(env.MAIL_E2E_SKIP_WEB_SERVER, '1');
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:8001');
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'pk-test');
  assert.equal(env.PLAYWRIGHT_JSON_OUTPUT_NAME, REPORT_RELATIVE_PATH);
});

test('playwrightArgs runs apps/mail suite with json/html reporting and zero retries', () => {
  const args = playwrightArgs();
  assert.ok(args.includes('apps/mail'));
  assert.ok(args.includes('--reporter=line,html,json'));
  assert.ok(args.includes('--retries=0'));
});

test('summarizeReport tallies passing and failing Playwright specs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-e2e-report-'));
  try {
    const missing = summarizeReport(path.join(tmpDir, 'missing.json'));
    assert.equal(missing.ok, false);

    const passFile = path.join(tmpDir, 'pass.json');
    fs.writeFileSync(
      passFile,
      JSON.stringify({
        suites: [
          {
            file: 'account-switch.spec.ts',
            specs: [{ ok: true, tests: [{ status: 'expected' }] }],
          },
        ],
      })
    );
    assert.deepEqual(summarizeReport(passFile), {
      ok: true,
      total: 1,
      failed: 0,
      summary: 'total=1 passed=1 failed=0',
    });

    const failFile = path.join(tmpDir, 'fail.json');
    fs.writeFileSync(
      failFile,
      JSON.stringify({
        suites: [
          {
            file: 'account-switch.spec.ts',
            specs: [
              {
                ok: false,
                tests: [{ status: 'expected' }, { status: 'unexpected' }],
              },
            ],
          },
        ],
      })
    );
    assert.deepEqual(summarizeReport(failFile), {
      ok: false,
      total: 2,
      failed: 1,
      summary: 'total=2 passed=1 failed=1',
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('mail-e2e-report-only workflow stays main-only and report-only', () => {
  const workflowPath = path.resolve(
    __dirname,
    '../../.github/workflows/mail-e2e-report-only.yaml'
  );
  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.match(source, /^name: Mail E2E report-only$/m);
  assert.match(
    source,
    /if: github\.ref == 'refs\/heads\/main' && github\.repository == 'tutur3u\/platform'/
  );
  assert.match(source, /id: mail-e2e[\s\S]*continue-on-error: true/);
  assert.match(
    source,
    /run: node scripts\/ci\/run-mail-e2e-report-only\.js run/
  );
});
