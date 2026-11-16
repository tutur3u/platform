import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { publicInputsDigest } from './wave1-native-artifact.mjs';
import { profileFor } from './wave1-native-profile.mjs';
import {
  assertMainReleaseAdmission,
  assertReceiptDigest,
  assertReleaseInputs,
  assertRestoredReleaseSeal,
  FIXTURE_PUBLIC_INPUTS_SHA256,
  MAIL_PRODUCTION_HOST,
  stampReleaseSeal,
} from './wave1-release-inputs.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/wave1-native-production.yaml', import.meta.url),
  'utf8'
);
const fixtureUrl = 'https://wave1-ci.supabase.invalid';
const fixtureKey = 'sb_publishable_wave1_ci_placeholder';
const mailUrl = `https://${MAIL_PRODUCTION_HOST}`;
const mailKey = 'sb_publishable_mail_production';

function evaluate(expression, scope) {
  const source = expression
    .replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '')
    .replace(/needs\.([\w-]+)/g, 'needs["$1"]');
  return vm.runInNewContext(source, scope, { timeout: 100 });
}

function jobIf(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, name);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n  [^ \n]/);
  const slice = rest.slice(0, next === -1 ? rest.length : next);
  const match = slice.match(/\n    if: (.*)\n/);
  assert.ok(match, `${name} if`);
  return match[1];
}

test('release-artifact builds only the exact main commit and never publishes', () => {
  assert.match(workflow, /release-artifact:\n/);
  assert.match(workflow, /source-sha:\n/);
  assert.match(workflow, /stampReleaseSeal/);
  assert.doesNotMatch(workflow, /mail-cloudflare\.yaml/);
  const sha = 'a'.repeat(40);
  const needs = {
    'production-policy': { outputs: { allowed: 'true' } },
    'release-admission': { result: 'success' },
  };
  const mainRelease = {
    inputs: {
      app: 'mail',
      'release-artifact': true,
      'source-sha': sha,
    },
    needs,
    github: { ref: 'refs/heads/main', sha },
    cancelled: () => false,
  };
  assert.equal(evaluate(jobIf('release-admission'), mainRelease), true);
  assert.equal(evaluate(jobIf('production-policy'), mainRelease), false);
  assert.equal(evaluate(jobIf('qualify'), mainRelease), true);
  assert.equal(evaluate(jobIf('publish'), mainRelease), false);
  const failedAdmission = {
    ...mainRelease,
    needs: {
      'production-policy': { outputs: { allowed: 'true' } },
      'release-admission': { result: 'failure' },
    },
  };
  assert.equal(evaluate(jobIf('qualify'), failedAdmission), false);

  const productionRelease = {
    ...mainRelease,
    github: { ref: 'refs/heads/production', sha },
  };
  assert.equal(evaluate(jobIf('qualify'), productionRelease), false);
  assert.equal(evaluate(jobIf('publish'), productionRelease), false);
  assert.equal(evaluate(jobIf('production-policy'), productionRelease), false);

  const mainSync = {
    ...mainRelease,
    inputs: { app: 'mail', 'release-artifact': false, 'source-sha': sha },
  };
  assert.equal(evaluate(jobIf('qualify'), mainSync), false);
  assert.equal(evaluate(jobIf('publish'), mainSync), false);
  assert.equal(evaluate(jobIf('production-policy'), mainSync), false);

  const productionPublish = {
    ...mainRelease,
    inputs: { app: 'mail', 'release-artifact': false, 'source-sha': '' },
    github: { ref: 'refs/heads/production', sha },
  };
  assert.equal(evaluate(jobIf('qualify'), productionPublish), true);
  assert.equal(evaluate(jobIf('publish'), productionPublish), true);
  const skippedAdmission = {
    ...productionPublish,
    needs: {
      'production-policy': { outputs: { allowed: 'true' } },
      'release-admission': { result: 'skipped' },
    },
  };
  assert.equal(evaluate(jobIf('qualify'), skippedAdmission), true);
  productionPublish.needs['production-policy'].outputs.allowed = 'false';
  assert.equal(evaluate(jobIf('qualify'), productionPublish), false);
  assert.equal(evaluate(jobIf('publish'), productionPublish), false);
});

test('mail release inputs fail closed and agree with the sealed digest', () => {
  assert.throws(
    () => assertReleaseInputs({ APP: 'mail', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey }),
    /Production public inputs are required/
  );
  assert.throws(
    () => assertReleaseInputs({ APP: 'mail', NEXT_PUBLIC_SUPABASE_URL: mailUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }),
    /Production public inputs are required/
  );
  assert.throws(
    () => assertReleaseInputs({
      APP: 'mail',
      NEXT_PUBLIC_SUPABASE_URL: fixtureUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey,
    }),
    /Fixture production public inputs are refused/
  );
  assert.equal(
    publicInputsDigest({
      NEXT_PUBLIC_SUPABASE_URL: fixtureUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey,
    }),
    FIXTURE_PUBLIC_INPUTS_SHA256
  );
  const wrong = {
    APP: 'mail',
    NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey,
  };
  assert.throws(
    () => assertReleaseInputs(wrong),
    (error) => {
      assert.match(error.message, /admitted host/);
      assert.equal(error.message.includes('other.supabase.co'), false);
      assert.equal(error.message.includes(mailKey), false);
      return true;
    }
  );
  const sha = 'b'.repeat(40);
  const env = {
    APP: 'mail',
    RELEASE_ARTIFACT: 'true',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    REQUESTED_SHA: sha,
    INPUT_ENVIRONMENT: 'wave1-mail-production',
    NEXT_PUBLIC_SUPABASE_URL: mailUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey,
  };
  const digest = assertReleaseInputs(env);
  assert.notEqual(digest, FIXTURE_PUBLIC_INPUTS_SHA256);
  const sealed = stampReleaseSeal({ sha, publicInputsSha256: digest }, env);
  assert.deepEqual(
    { sourceSha: sealed.sourceSha, inputEnvironment: sealed.inputEnvironment },
    { sourceSha: sha, inputEnvironment: 'wave1-mail-production' }
  );
  assert.equal(assertReceiptDigest(sealed, env), digest);
  assert.throws(
    () => assertReceiptDigest({ sha, publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256, sourceSha: sha, inputEnvironment: 'wave1-mail-production' }, env),
    /does not match the production build inputs/
  );
  assert.throws(
    () => assertMainReleaseAdmission({ ...env, GITHUB_REF: 'refs/heads/production' }),
    /only on refs\/heads\/main/
  );
  assert.throws(
    () => assertMainReleaseAdmission({ ...env, REQUESTED_SHA: 'c'.repeat(40) }),
    /does not match this main commit/
  );
  const restoredEnv = { ...env };
  delete restoredEnv.NEXT_PUBLIC_SUPABASE_URL;
  delete restoredEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.equal(assertRestoredReleaseSeal(sealed, restoredEnv), digest);
  assert.throws(
    () => assertRestoredReleaseSeal({ ...sealed, publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256 }, restoredEnv),
    /Fixture publicInputsSha256 is refused/
  );
  assert.match(workflow, /assertReceiptDigest/);
  assert.match(workflow, /assertReleaseInputs/);
  assert.match(workflow, /assertMainReleaseAdmission/);
});

// GitHub Actions writes a `run: |` body after stripping the first content
// line's indent. A quoted heredoc then ends only on a column-0 terminator.
function workflowRunScripts(text) {
  const lines = text.split('\n');
  const scripts = [];
  for (let i = 0; i < lines.length; i++) {
    const block = lines[i].match(/^(\s*)run:\s*\|(-)?\s*$/);
    if (block) {
      const parent = block[1].length;
      const body = [];
      let contentIndent = null;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === '') {
          body.push('');
          continue;
        }
        const indent = line.match(/^ */)?.[0].length ?? 0;
        if (contentIndent === null) {
          if (indent <= parent) break;
          contentIndent = indent;
        } else if (indent < contentIndent) {
          break;
        }
        body.push(line.slice(contentIndent));
      }
      i = j - 1;
      scripts.push(`${body.join('\n')}\n`);
      continue;
    }
    const inline = lines[i].match(/^\s*run:\s*(.+)$/);
    if (inline && !inline[1].startsWith('|') && !inline[1].startsWith('>')) {
      scripts.push(`${inline[1]}\n`);
    }
  }
  return scripts;
}

function releaseScript(marker) {
  const script = workflowRunScripts(workflow).find((item) => item.includes(marker));
  assert.ok(script, marker);
  return script;
}

function runReleaseStep(script, env, seed) {
  const root = mkdtempSync(join(tmpdir(), 'wave1-release-shell-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin, { mode: 0o700 });
    const realNode = JSON.stringify(process.execPath);
    const receiptWriter = join(root, 'prepare-receipt.mjs');
    writeFileSync(
      receiptWriter,
      `import { mkdirSync, writeFileSync } from 'node:fs';
const sha = process.env.SOURCE_SHA || '';
const digest = process.env.RECEIPT_DIGEST || '';
if (!/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{64}$/.test(digest)) process.exit(95);
mkdirSync('apps/' + process.env.APP, { recursive: true });
writeFileSync(
  'apps/' + process.env.APP + '/wave1-artifact.json',
  JSON.stringify({ schema: 1, sha, publicInputsSha256: digest }, null, 2) + '\\n'
);
`
    );
    chmodSync(receiptWriter, 0o600);
    const nodeStub = join(bin, 'node');
    writeFileSync(
      nodeStub,
      `#!/bin/bash
set -euo pipefail
real=${realNode}
if [[ "\${1:-}" == "--input-type=module" ]]; then
  exec "$real" "$@"
fi
if [[ "\${1:-}" == "scripts/ci/wave1-native-artifact.mjs" && "\${2:-}" == "prepare" ]]; then
  [[ "\${3:-}" == "$APP" && "\${4:-}" == "production" && "\${5:-}" == "$SOURCE_SHA" ]] || exit 96
  exec "$real" ${JSON.stringify(receiptWriter)}
fi
case "\${1:-}" in
  scripts/ci/wave1-native-artifact.mjs|scripts/ci/wave1-native-runtime.mjs|scripts/ci/wave1-native-publish.mjs)
    exit 0
    ;;
esac
echo "unexpected node invocation" >&2
exit 97
`
    );
    chmodSync(nodeStub, 0o700);
    const gitStub = join(bin, 'git');
    writeFileSync(
      gitStub,
      `#!/bin/bash
set -euo pipefail
if [[ "\${1:-}" == "rev-parse" && "\${2:-}" == "HEAD" ]]; then
  printf '%s\\n' "$SOURCE_SHA"
  exit 0
fi
echo "unexpected git invocation" >&2
exit 97
`
    );
    chmodSync(gitStub, 0o700);
    const pythonStub = join(bin, 'python3');
    writeFileSync(
      pythonStub,
      `#!/bin/bash
set -euo pipefail
if [[ "\${1:-}" == "scripts/ci/wave1-native-archive.py" ]]; then
  exit 0
fi
echo "unexpected python invocation" >&2
exit 97
`
    );
    chmodSync(pythonStub, 0o700);
    symlinkSync(fileURLToPath(new URL('..', import.meta.url)), join(root, 'scripts'));
    if (seed) {
      const appDir = join(root, 'apps', env.APP);
      mkdirSync(appDir, { recursive: true, mode: 0o700 });
      writeFileSync(join(appDir, 'wave1-artifact.json'), `${JSON.stringify(seed, null, 2)}\n`, {
        mode: 0o600,
      });
    }
    const step = join(root, 'step.sh');
    writeFileSync(step, script, { mode: 0o600 });
    const githubEnv = join(root, 'github.env');
    writeFileSync(githubEnv, '', { mode: 0o600 });
    const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', step], {
      cwd: root,
      encoding: 'utf8',
      timeout: 20000,
      env: {
        PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
        TMPDIR: tmpdir(),
        APP: env.APP,
        SOURCE_SHA: env.SOURCE_SHA,
        RELEASE_ARTIFACT: env.RELEASE_ARTIFACT,
        REQUESTED_SHA: env.REQUESTED_SHA,
        INPUT_ENVIRONMENT: env.INPUT_ENVIRONMENT,
        GITHUB_REF: env.GITHUB_REF,
        GITHUB_SHA: env.GITHUB_SHA,
        GITHUB_ENV: githubEnv,
        RUNNER_TEMP: join(root, 'runner'),
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
        RECEIPT_DIGEST: env.RECEIPT_DIGEST || '',
      },
    });
    const receiptPath = join(root, 'apps', env.APP, 'wave1-artifact.json');
    let receipt = null;
    try {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    } catch {
      receipt = null;
    }
    return {
      status: result.status,
      stderr: result.stderr || '',
      receipt,
      githubEnv: readFileSync(githubEnv, 'utf8'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('every production run script parses, and release heredocs end at column 0', () => {
  const scripts = workflowRunScripts(workflow);
  assert.ok(scripts.length >= 10);
  for (const script of scripts) {
    const parsed = spawnSync('/bin/bash', ['-n'], { input: script, encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
  }
  for (const marker of [
    'assertMainReleaseAdmission',
    'assertReleaseInputs',
    'stampReleaseSeal',
    'assertRestoredReleaseSeal',
  ]) {
    const script = scripts.find((item) => item.includes(marker));
    assert.ok(script, marker);
    assert.match(script, /<<'JS'\n/);
    assert.match(script, /^JS$/m);
    assert.doesNotMatch(script, /^[ \t]+JS$/m);
  }
});

test('release-artifact shells seal a fixture receipt and refuse fixture inputs', () => {
  const sha = 'd'.repeat(40);
  const admitted = {
    APP: 'mail',
    SOURCE_SHA: sha,
    RELEASE_ARTIFACT: 'true',
    REQUESTED_SHA: sha,
    INPUT_ENVIRONMENT: 'wave1-mail-production',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    NEXT_PUBLIC_SUPABASE_URL: mailUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mailKey,
  };
  const digest = publicInputsDigest(admitted);
  assert.notEqual(digest, FIXTURE_PUBLIC_INPUTS_SHA256);
  const sealed = stampReleaseSeal({ schema: 1, sha, publicInputsSha256: digest }, admitted);

  const admission = runReleaseStep(releaseScript('assertMainReleaseAdmission'), admitted);
  assert.equal(admission.status, 0, admission.stderr);
  const refusedRef = runReleaseStep(releaseScript('assertMainReleaseAdmission'), {
    ...admitted,
    GITHUB_REF: 'refs/heads/production',
  });
  assert.notEqual(refusedRef.status, 0);
  assert.match(refusedRef.stderr, /only on refs\/heads\/main/);
  assert.equal(refusedRef.stderr.includes(mailKey), false);
  assert.equal(refusedRef.stderr.includes(mailUrl), false);

  const configured = runReleaseStep(releaseScript('assertReleaseInputs'), admitted);
  assert.equal(configured.status, 0, configured.stderr);
  const host = profileFor('mail', 'production').host;
  assert.match(configured.githubEnv, new RegExp(`NEXT_PUBLIC_APP_URL=https://${host}\\n`));
  assert.equal(configured.githubEnv.includes(mailKey), false);
  const refusedInvalid = runReleaseStep(releaseScript('assertReleaseInputs'), {
    ...admitted,
    NEXT_PUBLIC_SUPABASE_URL: fixtureUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey,
  });
  assert.notEqual(refusedInvalid.status, 0);
  assert.match(refusedInvalid.stderr, /Production public inputs are required/);
  assert.equal(refusedInvalid.stderr.includes(fixtureKey), false);
  assert.equal(refusedInvalid.stderr.includes(fixtureUrl), false);
  const refusedFixture = runReleaseStep(releaseScript('assertReleaseInputs'), {
    ...admitted,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey,
  });
  assert.notEqual(refusedFixture.status, 0);
  assert.match(refusedFixture.stderr, /Fixture production public inputs are refused/);
  assert.equal(refusedFixture.stderr.includes(fixtureKey), false);
  assert.equal(refusedFixture.stderr.includes('example.com'), false);

  const prepared = runReleaseStep(releaseScript('stampReleaseSeal'), {
    ...admitted,
    RECEIPT_DIGEST: digest,
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(prepared.receipt.sourceSha, sha);
  assert.equal(prepared.receipt.inputEnvironment, 'wave1-mail-production');
  assert.equal(prepared.receipt.publicInputsSha256, digest);
  const skippedSeal = runReleaseStep(releaseScript('stampReleaseSeal'), {
    ...admitted,
    RELEASE_ARTIFACT: 'false',
    RECEIPT_DIGEST: digest,
  });
  assert.equal(skippedSeal.status, 0, skippedSeal.stderr);
  assert.equal(skippedSeal.receipt.sourceSha, undefined);
  const refusedPrepare = runReleaseStep(releaseScript('stampReleaseSeal'), {
    ...admitted,
    NEXT_PUBLIC_SUPABASE_URL: fixtureUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtureKey,
    RECEIPT_DIGEST: FIXTURE_PUBLIC_INPUTS_SHA256,
  });
  assert.notEqual(refusedPrepare.status, 0);
  assert.match(refusedPrepare.stderr, /Fixture production public inputs are refused/);
  assert.equal(refusedPrepare.receipt.sourceSha, undefined);

  const restored = runReleaseStep(
    releaseScript('assertRestoredReleaseSeal'),
    {
      ...admitted,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    },
    sealed
  );
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(restored.receipt.publicInputsSha256, digest);
  const restoredFixture = runReleaseStep(
    releaseScript('assertRestoredReleaseSeal'),
    {
      ...admitted,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    },
    { ...sealed, publicInputsSha256: FIXTURE_PUBLIC_INPUTS_SHA256 }
  );
  assert.notEqual(restoredFixture.status, 0);
  assert.match(restoredFixture.stderr, /Fixture publicInputsSha256 is refused/);
  assert.equal(restoredFixture.stderr.includes(mailUrl), false);
});
