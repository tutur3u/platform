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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'with-linux-secret-service.sh'
);
// Root bypasses directory permissions, so the unremovable-sandbox case needs a
// normal user. CI runners and developer machines both qualify.
const notRoot = process.getuid?.() !== 0;

function stub(dir, name, body) {
  writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${body}\n`, {
    mode: 0o755,
  });
}

// Stubs shadow the real tools on PATH, so the test never touches a session bus,
// keyring or FUSE mount and behaves the same on macOS and Linux.
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'secret-service-test-'));
  const bin = path.join(root, 'bin');
  const tmp = path.join(root, 'tmp');
  mkdirSync(bin);
  mkdirSync(tmp);
  const log = path.join(root, 'calls.log');
  stub(bin, 'timeout', 'shift\nexec "$@"');
  stub(
    bin,
    'dbus-run-session',
    'if [ "$1" = "--" ]; then shift; fi\nexec "$@"'
  );
  stub(bin, 'gnome-keyring-daemon', 'cat >/dev/null');
  stub(
    bin,
    'secret-tool',
    'case "$1" in\n  store) cat >/dev/null ;;\n  lookup) printf "%s" desktop-smoke-probe ;;\nesac'
  );
  stub(bin, 'mountpoint', 'exit "${FAKE_MOUNTED:-1}"');
  stub(bin, 'fusermount3', `printf '%s\\n' "$*" >> "${log}"`);
  return { root, bin, tmp, log };
}

function runWrapper(fx, command, env = {}) {
  return spawnSync('bash', [script, 'bash', '-c', command], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fx.bin}${path.delimiter}${process.env.PATH}`,
      TMPDIR: fx.tmp,
      ...env,
    },
  });
}

function cleanupFixture(fx) {
  // Restore modes that the unremovable-sandbox case deliberately broke.
  spawnSync('chmod', ['-R', 'u+rwx', fx.root]);
  rmSync(fx.root, { recursive: true, force: true });
}

test(
  'a passing smoke run keeps its success when the sandbox cannot be removed',
  { skip: !notRoot },
  () => {
    const fx = fixture();
    try {
      const result = runWrapper(
        fx,
        'mkdir -p "$XDG_RUNTIME_DIR/doc/inner" && chmod 000 "$XDG_RUNTIME_DIR/doc"'
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /could not remove the smoke sandbox/);
    } finally {
      cleanupFixture(fx);
    }
  }
);

test('a failing smoke run keeps its own exit status through teardown', () => {
  const fx = fixture();
  try {
    const result = runWrapper(fx, 'exit 3');
    assert.equal(result.status, 3, result.stderr);
  } finally {
    cleanupFixture(fx);
  }
});

test('a mounted document portal is lazily unmounted before the sandbox is removed', () => {
  const fx = fixture();
  try {
    const result = runWrapper(fx, 'mkdir -p "$XDG_RUNTIME_DIR/doc"', {
      FAKE_MOUNTED: '0',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(fx.log, 'utf8'), /^-uz -- \S+\/runtime\/doc$/mu);
    assert.deepEqual(readdirSync(fx.tmp), []);
  } finally {
    cleanupFixture(fx);
  }
});

test('an unmounted portal directory is removed without unmount calls', () => {
  const fx = fixture();
  try {
    const result = runWrapper(fx, 'mkdir -p "$XDG_RUNTIME_DIR/doc"');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readdirSync(fx.tmp).length, 0);
    assert.throws(() => readFileSync(fx.log, 'utf8'), /ENOENT/);
  } finally {
    cleanupFixture(fx);
  }
});
