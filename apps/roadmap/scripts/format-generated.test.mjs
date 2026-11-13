import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  formatGenerated,
  GENERATED_FILES,
  resolveOxfmt,
} from './format-generated.mjs';
import { serialize } from './generate-history.mjs';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(appRoot, '../..');

function fakeRepo({ pinned, installed }) {
  const root = mkdtempSync(join(tmpdir(), 'roadmap-format-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ devDependencies: { oxfmt: pinned } })
  );
  if (installed) {
    mkdirSync(join(root, 'node_modules/oxfmt/bin'), { recursive: true });
    writeFileSync(
      join(root, 'node_modules/oxfmt/package.json'),
      JSON.stringify({
        version: installed,
        bin: { oxfmt: 'bin/oxfmt' },
      })
    );
  }
  return root;
}

test('refuses an installed oxfmt that is not the pinned version', () => {
  const root = fakeRepo({ pinned: '0.74.0', installed: '0.73.0' });
  try {
    assert.throws(
      () => resolveOxfmt(root),
      /Installed oxfmt 0\.73\.0 does not match the pinned 0\.74\.0/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a missing oxfmt and an unpinned manifest', () => {
  const missing = fakeRepo({ pinned: '0.74.0' });
  const ranged = fakeRepo({ pinned: '^0.74.0', installed: '0.74.0' });
  try {
    assert.throws(() => resolveOxfmt(missing), /bun install --frozen-lockfile/);
    assert.throws(() => resolveOxfmt(ranged), /pin an exact oxfmt/);
  } finally {
    rmSync(missing, { recursive: true, force: true });
    rmSync(ranged, { recursive: true, force: true });
  }
});

test('invokes the pinned oxfmt with the root config over the generated files', () => {
  const root = fakeRepo({ pinned: '0.74.0', installed: '0.74.0' });
  const calls = [];
  try {
    const status = formatGenerated({
      repoRoot: root,
      check: true,
      spawn: (...call) => {
        calls.push(call);
        return { status: 7 };
      },
    });
    assert.equal(status, 7);
    const [command, args, options] = calls[0];
    assert.equal(command, process.execPath);
    assert.deepEqual(args.slice(0, 5), [
      join(root, 'node_modules/oxfmt/bin/oxfmt'),
      '--config',
      join(root, '.oxfmtrc.json'),
      '--check',
      '--threads',
    ]);
    assert.deepEqual(
      args.slice(6),
      GENERATED_FILES.map((file) => join(appRoot, file))
    );
    assert.equal(options.cwd, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const installed = existsSync(join(repoRoot, 'node_modules/oxfmt/package.json'));

test(
  'a refreshed history that the generator serializes fails oxfmt until normalized',
  { skip: !installed && 'oxfmt is not installed (bun install)' },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'roadmap-history-'));
    try {
      const committed = join(appRoot, 'src/generated/history.json');
      const target = join(dir, 'history.json');
      const run = (check) =>
        formatGenerated({
          repoRoot,
          cwd: dir,
          files: ['history.json'],
          check,
          stdio: 'ignore',
        });

      // Negative control: the generator's own serialization is rejected.
      writeFileSync(
        target,
        serialize(JSON.parse(readFileSync(committed, 'utf8')))
      );
      assert.notEqual(run(true), 0);

      // Positive control: normalizing yields the committed canonical bytes.
      assert.equal(run(false), 0);
      assert.equal(run(true), 0);
      assert.equal(
        readFileSync(target, 'utf8'),
        readFileSync(committed, 'utf8')
      );

      // The step is idempotent and leaves a canonical file untouched.
      copyFileSync(committed, target);
      assert.equal(run(true), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
);

test(
  'a malformed generated file is reported, never silently accepted',
  { skip: !installed && 'oxfmt is not installed (bun install)' },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'roadmap-malformed-'));
    try {
      writeFileSync(join(dir, 'live.json'), '{ "schema": 1,, }\n');
      const status = formatGenerated({
        repoRoot,
        cwd: dir,
        files: ['live.json'],
        check: true,
        stdio: 'ignore',
      });
      assert.notEqual(status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
);
