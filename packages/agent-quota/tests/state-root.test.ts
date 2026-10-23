import { userInfo } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { blockLedgerPath, updateBlockLedger } from '../src/block-ledger';
import {
  codexRoot,
  defaultCollectorPaths,
  t3StateDatabase,
} from '../src/collectors/paths';
import { hookDirectory, transactLedger } from '../src/hook-ledger';
import { stateRoot } from '../src/state-root';

describe('isolated state root', () => {
  it('resolves all default state paths beneath the test root', () => {
    const root = process.env.AGENT_QUOTA_STATE_ROOT!;
    for (const path of [
      blockLedgerPath(),
      hookDirectory(),
      codexRoot('codex'),
      codexRoot('codex_ai4ed'),
      t3StateDatabase(),
      defaultCollectorPaths().snapshotCacheDir,
    ])
      expect(path?.startsWith(root)).toBe(true);
  });

  it('keeps production defaults under HOME when it differs from passwd home', () => {
    const testHome = join(process.env.AGENT_QUOTA_STATE_ROOT!, 'operator-home');
    expect(testHome).not.toBe(userInfo().homedir);
    vi.stubEnv('HOME', testHome);
    vi.stubEnv('VITEST', '');
    vi.stubEnv('AGENT_QUOTA_STATE_ROOT', join(testHome, 'ignored-override'));
    try {
      expect(process.env.HOME).toBe(testHome);
      expect(stateRoot('.t3', 'caches')).toBe(join(testHome, '.t3', 'caches'));
      expect(defaultCollectorPaths().codexT3Root).toBe(
        join(testHome, '.codex-t3')
      );
      expect(defaultCollectorPaths().snapshotCacheDir).toBe(
        join(testHome, '.t3', 'caches')
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects hook and block ledger writes beneath the passwd home in Vitest', async () => {
    const home = userInfo().homedir;
    const hookPath = join(home, '.t3', 'caches', 'agent-quota-test-guard');
    const blockPath = join(
      home,
      '.local',
      'share',
      'tuturuuu',
      'orchestration',
      'quota',
      'agent-quota-test-guard.json'
    );
    await expect(transactLedger(() => {}, hookPath)).rejects.toThrow(
      'test-state-write-under-user-home'
    );
    await expect(updateBlockLedger(() => {}, blockPath)).rejects.toThrow(
      'test-state-write-under-user-home'
    );
  });
});
