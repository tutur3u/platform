const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  assertSecureDartDefines,
  findInsecureDartDefines,
  parseDartDefineArgs,
  parseDartDefineFile,
} = require('./mobile-validate-dart-defines.js');

const secure = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  API_BASE_URL: 'https://tuturuuu.com',
};

function writeDefineFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-defines-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

test('parseDartDefineFile reads json and env formats', () => {
  assert.deepEqual(parseDartDefineFile('{"A":"1","B":2}'), { A: '1', B: '2' });
  assert.deepEqual(
    parseDartDefineFile('# note\nA=1\nexport B="two words"\n\nC=x=y\r\n'),
    { A: '1', B: 'two words', C: 'x=y' }
  );
});

test('parseDartDefineArgs reads --dart-define overrides only', () => {
  assert.deepEqual(
    parseDartDefineArgs([
      '--build-name=1.0.0',
      '--dart-define=API_BASE_URL=http://x.test/?a=b',
    ]),
    { API_BASE_URL: 'http://x.test/?a=b' }
  );
});

test('accepts https supabase and api urls', () => {
  assert.deepEqual(findInsecureDartDefines(secure), []);
});

test('rejects cleartext, missing and malformed required urls', () => {
  assert.equal(
    findInsecureDartDefines({
      ...secure,
      API_BASE_URL: 'http://localhost:7803',
    }).length,
    1
  );
  assert.equal(
    findInsecureDartDefines({ API_BASE_URL: secure.API_BASE_URL }).length,
    1
  );
  assert.equal(
    findInsecureDartDefines({ ...secure, NEXT_PUBLIC_SUPABASE_URL: 'https://' })
      .length,
    1
  );
  assert.equal(findInsecureDartDefines({}).length, 2);
});

test('rejects cleartext optional service overrides but allows unset ones', () => {
  assert.deepEqual(
    findInsecureDartDefines({ ...secure, TASKS_API_BASE_URL: '' }),
    []
  );
  assert.deepEqual(
    findInsecureDartDefines({
      ...secure,
      TASKS_API_BASE_URL: 'http://tasks.test',
    }),
    ['TASKS_API_BASE_URL must be an https URL when set.']
  );
});

test('assertSecureDartDefines throws for a cleartext file and honors args', () => {
  const file = writeDefineFile(
    '.env.production',
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321\nAPI_BASE_URL=https://tuturuuu.com\n'
  );
  assert.throws(
    () => assertSecureDartDefines({ file }),
    /insecure dart-defines/u
  );
  assert.doesNotThrow(() =>
    assertSecureDartDefines({
      file,
      args: [
        '--dart-define=NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co',
      ],
    })
  );
  assert.throws(() =>
    assertSecureDartDefines({
      file: writeDefineFile('.json', JSON.stringify(secure)),
      args: ['--dart-define=API_BASE_URL=http://10.0.2.2:7803'],
    })
  );
});

test('Linux development release guard skips missing URLs and validates configured URLs', () => {
  const { spawnSync } = require('node:child_process');
  const workflow = fs.readFileSync(
    path.join(__dirname, '../.github/workflows/mobile-build-linux.yaml'),
    'utf8'
  );
  const step = workflow
    .split('      - name: Check development release configuration')[1]
    .split('      - name: Build Linux')[0];
  const script = step
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/u, ''))
    .join('\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-linux-guard-'));
  try {
    for (const [supabase, api, status, ready] of [
      ['', '', 0, 'false'],
      ['https://project.supabase.co', '', 0, 'false'],
      ['', 'https://tuturuuu.com', 0, 'false'],
      ['https://project.supabase.co', 'https://tuturuuu.com', 0, 'true'],
      ['http://project.supabase.co', 'https://tuturuuu.com', 1, null],
    ]) {
      const output = path.join(dir, 'output');
      fs.writeFileSync(output, '');
      const result = spawnSync('bash', ['-e', '-c', script], {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          SUPABASE_URL: supabase,
          API_BASE_URL: api,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, status, result.stderr);
      assert.equal(
        fs.readFileSync(output, 'utf8'),
        ready ? `ready=${ready}\n` : ''
      );
    }
    for (const name of ['Build Linux', 'Audit Linux bundle']) {
      const section = workflow
        .split(`      - name: ${name}\n`)[1]
        .split('      - name: ')[0];
      assert.match(
        section,
        /if: steps.release-config.outputs.ready == 'true'/u
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
