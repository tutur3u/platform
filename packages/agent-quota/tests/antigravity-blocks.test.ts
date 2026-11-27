import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { collectAntigravityBlocks } from '../src/collectors/antigravity-blocks';

it('uses the failed root run model and its compact reset receipt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-receipt-'));
  const path = join(dir, 'fixture.sqlite');
  try {
    const db = new DatabaseSync(path);
    try {
      db.exec(`
        CREATE TABLE orchestration_v2_projection_runs (
          run_id TEXT, provider_instance_id TEXT, status TEXT, payload_json TEXT
        );
        CREATE TABLE orchestration_v2_projection_turn_items (
          run_id TEXT, node_id TEXT, type TEXT, status TEXT, updated_at TEXT, payload_json TEXT
        );
        INSERT INTO orchestration_v2_projection_runs VALUES (
          'run', 'antigravity_2', 'failed',
          '{"rootNodeId":"root","modelSelection":{"model":"gemini-4-hydrogen"}}'
        );
        INSERT INTO orchestration_v2_projection_turn_items VALUES
          ('run','root','error','failed','2026-11-27T15:59:00.000Z',
           '{"failure":{"message":"Individual quota reached. Resets in 167h18m23s."}}'),
          ('run','child','error','failed','2026-11-27T15:59:00.000Z',
           '{"failure":{"message":"Individual quota reached. Resets in 150h."}}');
      `);
    } finally {
      db.close();
    }
    expect(
      collectAntigravityBlocks(
        ['antigravity_2'],
        new Date('2026-11-27T16:00:00Z'),
        path
      )
    ).toMatchObject([
      {
        pool: 'antigravity_2',
        modelScope: 'gemini-4-hydrogen',
        observedAt: '2026-11-27T15:59:00.000Z',
        resetAt: '2026-12-04T15:17:23.000Z',
      },
    ]);
    expect(
      collectAntigravityBlocks(
        ['antigravity_2'],
        new Date('2026-12-04T15:17:23Z'),
        path
      )
    ).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
