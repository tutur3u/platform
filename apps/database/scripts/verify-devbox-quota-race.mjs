import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const container = process.argv[2];
if (!/^supabase_db_tt-[a-z0-9-]+$/.test(container ?? ''))
  throw new Error('An isolated tt- Supabase container is required');
const args = [
  'exec',
  '-i',
  container,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
];
const source = readFileSync(
  new URL('./fixtures/devbox-quota-race.sql', import.meta.url),
  'utf8'
);
const [setup, assertions] = source.split('-- PARALLEL ADMISSION');
if (!setup || !assertions) throw new Error('Missing race fixture boundary');
// Connections see committed setup, then contend on the production RPC lock.
const start = setup.indexOf('begin;\nselect no_plan();');
execFileSync('docker', args, {
  input: setup.slice(0, start),
  stdio: ['pipe', 'pipe', 'pipe'],
});
const results = await Promise.all(
  Array.from({ length: 10 }, () =>
    promisify(execFile)('docker', [
      ...args,
      '-Atc',
      'select private.devbox_quota_test_admit()',
    ])
  )
);
const admitted = results.filter((r) => r.stdout.trim() === 't').length;
const output = execFileSync('docker', args, {
  input: `begin; set search_path=public,extensions; select no_plan(); select is(${admitted},1,'ten concurrent RPCs admit exactly one'); ${assertions}`,
  encoding: 'utf8',
});
process.stdout.write(output);
if (/not ok/.test(output) || !output.includes('1..3')) process.exitCode = 1;
