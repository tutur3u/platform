// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub expressions are literal workflow data.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Parse with Bun's built-in YAML, as the workflow checker does, so the test needs no
// installed npm dependency.
const parse = (file) =>
  JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        file,
      ],
      { encoding: 'utf8' }
    )
  );

const action = new URL('./action.yml', import.meta.url);
const script = new URL('./login.sh', import.meta.url);

test('login accepts a token on stdin, suppresses diagnostics and tolerates missing/rejected credentials', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ghcr-login-'));
  try {
    writeFileSync(
      path.join(dir, 'docker'),
      `#!/usr/bin/env bash
printf '%s' "$*" > "$LOGIN_CAPTURE.args"
cat > "$LOGIN_CAPTURE.stdin"
echo "$GHCR_TOKEN"
echo "$GHCR_TOKEN" >&2
exit "$LOGIN_EXIT"
`,
      { mode: 0o755 }
    );
    for (const [token, exit] of [
      ['', '0'],
      ['private-test-token', '0'],
      ['private-test-token', '1'],
    ]) {
      const capture = path.join(dir, `capture-${token.length}-${exit}`);
      const result = spawnSync('bash', [script.pathname], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          GHCR_TOKEN: token,
          GHCR_USERNAME: 'test-actor',
          LOGIN_EXIT: exit,
          LOGIN_CAPTURE: capture,
        },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
      if (token) {
        assert.equal(result.stdout.includes(token), false);
        assert.equal(readFileSync(`${capture}.stdin`, 'utf8'), token);
        assert.equal(
          readFileSync(`${capture}.args`, 'utf8'),
          'login ghcr.io --username test-actor --password-stdin'
        );
      } else {
        assert.match(result.stdout, /credentials unavailable/);
        assert.equal(
          readdirSync(dir).some((name) => name.startsWith('capture-0')),
          false
        );
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('all contract stack jobs authenticate before startup with read-only package access', () => {
  const workflows = new URL('../../workflows/', import.meta.url);
  let count = 0;
  for (const name of readdirSync(workflows)) {
    if (!name.endsWith('.yaml')) continue;
    const source = readFileSync(new URL(name, workflows), 'utf8');
    if (!source.includes('SUPABASE_INTERNAL_IMAGE_REGISTRY')) continue;
    const workflow = parse(new URL(name, workflows).pathname);
    for (const job of Object.values(workflow.jobs)) {
      if (!job['runs-on'] || job.if === '${{ false }}') continue;
      count++;
      assert.deepEqual(
        job.permissions,
        { contents: 'read', packages: 'read' },
        name
      );
      const index = job.steps.findIndex(
        (step) => step.uses === './.github/actions/login-supabase-registry'
      );
      assert.ok(index > 0, name);
      assert.match(job.steps[index - 1].uses, /^actions\/checkout@/, name);
      assert.deepEqual(
        job.steps[index].with,
        {
          username: '${{ github.actor }}',
          token: '${{ secrets.GITHUB_TOKEN }}',
        },
        name
      );
    }
  }
  assert.equal(count, 18);
  const login = parse(action.pathname).runs.steps[0];
  assert.equal(login['continue-on-error'], true);
});
