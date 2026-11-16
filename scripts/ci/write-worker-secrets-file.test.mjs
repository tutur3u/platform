import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  collectSecrets,
  main,
  parseArgs,
} from './write-worker-secrets-file.mjs';

const scratch = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'worker-secrets-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('writes required and set optional names to a new 0600 file', (t) => {
  const out = join(scratch(t), 'secrets.json');
  main([out, 'A_KEY', 'B_KEY', '--optional', 'C_KEY', 'D_KEY'], {
    A_KEY: 'value-a',
    B_KEY: 'value-b',
    C_KEY: 'value-c',
  });
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), {
    A_KEY: 'value-a',
    B_KEY: 'value-b',
    C_KEY: 'value-c',
  });
  assert.equal(statSync(out).mode & 0o777, 0o600);
});

test('a missing or blank required name fails without writing or echoing values', (t) => {
  const out = join(scratch(t), 'secrets.json');
  for (const env of [
    { B_KEY: 'SECRET-B' },
    { A_KEY: '  ', B_KEY: 'SECRET-B' },
  ]) {
    assert.throws(
      () => main([out, 'A_KEY', 'B_KEY'], env),
      (error) =>
        error.message === 'Missing required Worker secret: A_KEY' &&
        !error.message.includes('SECRET')
    );
    assert.throws(() => statSync(out), { code: 'ENOENT' });
  }
});

test('refuses to overwrite or follow an existing path', (t) => {
  const out = join(scratch(t), 'secrets.json');
  writeFileSync(out, 'existing');
  assert.throws(() => main([out, 'A_KEY'], { A_KEY: 'value' }), {
    code: 'EEXIST',
  });
  assert.equal(readFileSync(out, 'utf8'), 'existing');
});

test('public-https rejects non-https and private endpoints by name only', () => {
  const parsed = parseArgs([
    'out.json',
    'URL_KEY',
    '--public-https',
    'URL_KEY',
  ]);
  for (const value of [
    'http://project.supabase.co',
    'https://localhost:54321',
    'https://127.0.0.1',
    'https://10.0.0.5',
    'https://192.168.1.2',
    'https://172.16.0.1',
    'https://api.localhost',
    'https://host.docker.internal',
    'not a url SECRET',
  ])
    assert.throws(
      () => collectSecrets(parsed, { URL_KEY: value }),
      (error) =>
        /^URL_KEY must be (an|a public) https/u.test(error.message) &&
        !error.message.includes('SECRET')
    );
  assert.deepEqual(
    collectSecrets(parsed, { URL_KEY: 'https://project.supabase.co' }),
    { URL_KEY: 'https://project.supabase.co' }
  );
});

test('argument validation rejects malformed names and orphan public-https', () => {
  assert.throws(() => parseArgs([]), /Usage/u);
  assert.throws(() => parseArgs(['out.json']), /At least one required/u);
  assert.throws(
    () => parseArgs(['out.json', 'lower_case']),
    /Invalid secret name/u
  );
  assert.throws(
    () => parseArgs(['out.json', 'A_KEY', '--public-https', 'B_KEY']),
    /must also be a required name/u
  );
});
