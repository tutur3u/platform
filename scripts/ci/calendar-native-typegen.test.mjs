import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  new URL(
    '../../.github/workflows/mail-calendar-tasks-builds.yaml',
    import.meta.url
  ),
  'utf8'
);
const step = workflow.match(
  /^ {6}- name: Generate bindings from the actual emitted config\n([\s\S]*?)(?=^ {6}- name:)/m
)?.[1];
assert.ok(step, 'actual workflow typegen step exists');
assert.match(step, /^ {8}working-directory: apps\/calendar$/m);
assert.match(
  step,
  /^ {10}CALENDAR_EMITTED_CONFIG: \$\{\{ steps\.output\.outputs\.config \}\}$/m
);
const block = step.match(/^ {8}run: \|\n([\s\S]*)$/m)?.[1];
assert.ok(block, 'actual workflow shell block exists');
const script = block.replace(/^ {10}/gm, '');
const original =
  '/// handwritten stub\ninterface CloudflareEnv { ASSETS: Fetcher; }\n';
const generated = 'interface CloudflareEnv { GENERATED: string; }\n';

const fakeBun = `#!/bin/bash
set -euo pipefail
[[ "$#" == 10 ]]
[[ "$1" == x && "$2" == --no-install && "$3" == wrangler && "$4" == types ]]
[[ "$5" == --config && "$6" == "$EXPECTED_CONFIG" ]]
[[ "$7" == --env-interface && "$8" == CloudflareEnv && "$9" == --include-runtime=false ]]
output="\${10}"
[[ "$output" == "$RUNNER_TEMP"/calendar-typegen.*/cloudflare-env.d.ts ]]
[[ ! -e "$output" && ! -L "$output" ]]
printf '%s' invoked > "$INVOCATION_RECEIPT"
case "$TYPEGEN_MODE" in
  success|cf-failure) printf 'interface CloudflareEnv { GENERATED: string; }\\n' > "$output" ;;
  partial) printf 'partial' > "$output"; exit 17 ;;
  missing) : ;;
  empty) : > "$output" ;;
  symlink) ln -s "$SYMLINK_TARGET" "$output" ;;
  *) exit 91 ;;
esac
`;

const fakeNode = `#!/bin/bash
set -euo pipefail
[[ "$#" == 7 ]]
[[ "$1" == ../../scripts/ci/calendar-cf-types.mjs ]]
[[ "$2" == --config && "$3" == "$EXPECTED_CONFIG" ]]
[[ "$4" == --reference && "$5" == "$RUNNER_TEMP"/calendar-typegen.*/cloudflare-env.d.ts ]]
[[ "$6" == --sha && "$7" == "$SOURCE_SHA" ]]
[[ -f "$5" && -s "$5" && ! -L "$5" ]]
if [[ "$TYPEGEN_MODE" == cf-failure ]]; then exit 23; fi
cp -- "$5" cloudflare-env.d.ts
printf '%s\\n' '{"schema":1,"referenceCompared":true}'
`;

for (const mode of [
  'success',
  'partial',
  'missing',
  'empty',
  'symlink',
  'cf-failure',
]) {
  test(`workflow typegen: ${mode} preserves output and cleanup contracts`, () => {
    const root = mkdtempSync(join(tmpdir(), 'calendar-typegen-test-'));
    try {
      const app = join(root, 'apps', 'calendar');
      const bin = join(root, 'bin');
      const runnerTemp = join(root, 'runner temp');
      for (const path of [app, bin, runnerTemp]) {
        mkdirSync(path, { recursive: true });
      }
      const target = join(app, 'cloudflare-env.d.ts');
      const config = join(app, 'dist', 'server', 'wrangler.json');
      mkdirSync(join(app, 'dist', 'server'), { recursive: true });
      writeFileSync(config, '{}');
      writeFileSync(target, original);
      writeFileSync(join(bin, 'bun'), fakeBun, { mode: 0o755 });
      writeFileSync(join(bin, 'node'), fakeNode, { mode: 0o755 });
      const unrelated = join(runnerTemp, 'owned-fixture.txt');
      const symlinkTarget = join(root, 'generated-target.d.ts');
      const receipt = join(root, 'invocation.txt');
      writeFileSync(unrelated, 'unrelated owner bytes');
      writeFileSync(symlinkTarget, generated);
      const result = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
        {
          cwd: app,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            RUNNER_TEMP: runnerTemp,
            CALENDAR_EMITTED_CONFIG: config,
            EXPECTED_CONFIG: config,
            SOURCE_SHA: 'a'.repeat(40),
            INVOCATION_RECEIPT: receipt,
            SYMLINK_TARGET: symlinkTarget,
            TYPEGEN_MODE: mode,
          },
        }
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(readFileSync(receipt, 'utf8'), 'invoked');
      assert.equal(
        result.status,
        mode === 'success'
          ? 0
          : mode === 'partial'
            ? 17
            : mode === 'cf-failure'
              ? 23
              : 1
      );
      assert.equal(
        readFileSync(target, 'utf8'),
        mode === 'success' ? generated : original
      );
      assert.deepEqual(
        readdirSync(runnerTemp),
        mode === 'success'
          ? ['calendar-cf-types.json', 'owned-fixture.txt']
          : ['owned-fixture.txt']
      );
      if (mode === 'success')
        assert.deepEqual(
          JSON.parse(
            readFileSync(join(runnerTemp, 'calendar-cf-types.json'), 'utf8')
          ),
          { schema: 1, referenceCompared: true }
        );
      assert.equal(readFileSync(unrelated, 'utf8'), 'unrelated owner bytes');
      assert.equal(readFileSync(symlinkTarget, 'utf8'), generated);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
