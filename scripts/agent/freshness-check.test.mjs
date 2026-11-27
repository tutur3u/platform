import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('reports origin-only commits as behind and labels cached refs', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-freshness-'));
  try {
    writeFileSync(
      join(fixture, 'git'),
      '#!/bin/sh\ncase "$1" in\nfetch) exit "$FETCH_STATUS";;\nrev-list) printf "2\\t5\\n";;\nesac\n',
      { mode: 0o755 }
    );
    const script = fileURLToPath(
      new URL('./freshness-check.sh', import.meta.url)
    );
    for (const [fetchStatus, suffix] of [
      ['0', /fetched \d{2}:\d{2}/],
      ['1', /fetch unavailable, cached refs/],
    ]) {
      const result = spawnSync('sh', [script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: fixture,
          FETCH_STATUS: fetchStatus,
          PATH: fixture + delimiter + process.env.PATH,
        },
      });
      assert.equal(result.status, 0);
      const [summary, hint] = result.stdout.trimEnd().split('\n');
      assert.match(
        summary,
        /^Repo freshness: HEAD is 5 behind \/ 2 ahead of origin\/main /
      );
      assert.match(summary, suffix);
      assert.match(hint, /start a new worktree from origin\/main/);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
