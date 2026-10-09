import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/meet-cloudflare.yaml', import.meta.url),
  'utf8'
);
const step = workflow.match(
  /^ {6}- name: Verify canonical routes\n([\s\S]*?)(?=^ {6}- name:|$(?![\s\S]))/m
);
assert.ok(step, 'canonical-route verification step must exist');
assert.match(step[1], /^ {8}timeout-minutes: 8$/m);
const run = step[1].match(/^ {8}run: \|\n((?: {10}.+\n)+)/m);
assert.ok(run, 'verification must retain its literal workflow run block');
const commands = run[1]
  .trimEnd()
  .split('\n')
  .map((line) => line.slice(10));
const flags =
  '--fail --retry 5 --retry-delay 5 --connect-timeout 5 --max-time 20 --retry-max-time 150';
assert.deepEqual(commands, [
  `curl ${flags} https://meet-realtime.tuturuuu.com/health`,
  `curl ${flags} --output /dev/null https://meet.tuturuuu.com/login`,
]);

function runVerification(firstExit, secondExit) {
  const directory = mkdtempSync(join(tmpdir(), 'meet-health-bounds-'));
  const calls = join(directory, 'calls');
  try {
    writeFileSync(
      join(directory, 'curl'),
      `#!/bin/bash
printf '%s\\n' "$*" >> "$CURL_CALLS"
if [[ -e "$CURL_FIRST_SEEN" ]]; then
  exit "$CURL_SECOND_EXIT"
fi
: > "$CURL_FIRST_SEEN"
exit "$CURL_FIRST_EXIT"
`,
      { mode: 0o700 }
    );
    const result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-e', '-c', commands.join('\n')],
      {
        cwd: directory,
        env: {
          PATH: directory,
          CURL_CALLS: calls,
          CURL_FIRST_SEEN: join(directory, 'first-seen'),
          CURL_FIRST_EXIT: String(firstExit),
          CURL_SECOND_EXIT: String(secondExit),
        },
        encoding: 'utf8',
        timeout: 2_000,
        maxBuffer: 64 * 1024,
      }
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return {
      status: result.status,
      calls: readFileSync(calls, 'utf8').trimEnd().split('\n'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('first curl failure retains exit 22 and skips frontend verification', () => {
  const result = runVerification(22, 0);
  assert.equal(result.status, 22);
  assert.deepEqual(result.calls, [commands[0].slice('curl '.length)]);
});

test('second curl failure retains exit 28 after successful realtime verification', () => {
  const result = runVerification(0, 28);
  assert.equal(result.status, 28);
  assert.deepEqual(
    result.calls,
    commands.map((command) => command.slice('curl '.length))
  );
});

test('both successful health commands retain order and frontend output discard', () => {
  const result = runVerification(0, 0);
  assert.equal(result.status, 0);
  assert.deepEqual(
    result.calls,
    commands.map((command) => command.slice('curl '.length))
  );
});
