import { userInfo } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockLedgerPath, updateBlockLedger } from '../src/block-ledger';
import { codexRoot, t3StateDatabase } from '../src/collectors/paths';
import { hookDirectory, transactLedger } from '../src/hook-ledger';

describe('isolated state root', () => {
  it('resolves all default state paths beneath the test root', () => {
    const root = process.env.AGENT_QUOTA_STATE_ROOT!;
    for (const path of [
      blockLedgerPath(),
      hookDirectory(),
      codexRoot('codex'),
      t3StateDatabase(),
    ])
      expect(path?.startsWith(root)).toBe(true);
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
