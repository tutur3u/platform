import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { admit } from '../src/admission';
import { collectSnapshot } from '../src/collectors/snapshot';
import { fixture, now, pool } from './review-regressions-helpers';

describe('independent review regressions', () => {
  it('preserves real Antigravity scope and bounds uncovered Gemini', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-scope-'));
    try {
      await writeFile(
        join(dir, 'antigravity.json'),
        JSON.stringify({
          instanceId: 'antigravity',
          driver: 'antigravity',
          usageLimits: {
            checkedAt: now.toISOString(),
            windows: [
              {
                id: '3p-5h',
                label: 'Claude & GPT (shared) · 5-hour',
                usedPercent: 0,
                resetsAt: '2026-10-24T04:00:00Z',
              },
            ],
          },
        })
      );
      const { request, context } = fixture();
      context.accounts[1] = await collectSnapshot(
        pool('antigravity', 'antigravity'),
        dir
      );
      expect(context.accounts[1].windows[0]?.scope).toEqual({
        kind: 'models',
        modelPrefixes: ['claude-', 'gpt-'],
      });
      request.requirements.authorizedInstanceIds = ['antigravity'];
      expect(admit(request, context)).toMatchObject({
        chosen: { providerInstanceId: 'antigravity' },
        pools: expect.arrayContaining([
          expect.objectContaining({ pool: 'antigravity', state: 'UNKNOWN' }),
        ]),
      });
      expect(admit({ ...request, requestId: 'next' }, context).status).toBe(
        'block'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('keeps scoped Fable exhaustion off other Claude models and identifies all five homes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-claude-'));
    try {
      const identities = new Set();
      const accounts = [];
      for (const instanceId of [
        'claudeAgent',
        'claude_mira',
        'claude_kv',
        'claude_dd',
        'claude_hehe',
      ]) {
        await writeFile(
          join(dir, `${instanceId}.json`),
          JSON.stringify({
            instanceId,
            driver: 'claudeAgent',
            usageLimits: {
              checkedAt: now.toISOString(),
              windows: [
                {
                  id: 'five_hour',
                  label: 'Session',
                  usedPercent: 10,
                  resetsAt: '2026-10-24T04:00:00Z',
                },
                {
                  id: 'seven_day_fable',
                  label: 'Weekly · Fable',
                  usedPercent: 100,
                  resetsAt: '2026-10-24T04:00:00Z',
                },
              ],
            },
          })
        );
        const account = await collectSnapshot(
          { ...pool(instanceId, 'claude'), models: ['claude-opus-4-6'] },
          dir,
          {
            providerInstances: {
              [instanceId]: {
                driver: 'claudeAgent',
                config: {
                  homePath: `/fixture/${instanceId === 'claudeAgent' ? 'claude_skora' : instanceId}`,
                },
              },
            },
          }
        );
        identities.add(account.accountIdentityHash);
        accounts.push(account);
      }
      expect(identities.size).toBe(5);
      expect(identities.has(undefined)).toBe(false);
      const { request, context } = fixture();
      context.accounts = accounts;
      request.currentInstanceId = 'claudeAgent';
      request.requirements.authorizedInstanceIds = ['claude_dd'];
      request.requirements.privacyApprovedInstanceIds = ['claude_dd'];
      request.requirements.candidates = [
        {
          instanceId: 'claude_dd',
          model: 'claude-opus-4-6',
          capabilities: ['implementation'],
        },
      ];
      expect(admit(request, context).chosen?.providerInstanceId).toBe(
        'claude_dd'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('rejects symlink and oversized provider caches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-cache-'));
    try {
      await writeFile(join(dir, 'other.json'), '{}');
      await symlink(join(dir, 'other.json'), join(dir, 'antigravity.json'));
      const linked = await collectSnapshot(
        pool('antigravity', 'antigravity'),
        dir
      );
      expect(linked.windows[0]?.freshnessTtlMs).toBe(0);
      await rm(join(dir, 'antigravity.json'));
      await writeFile(
        join(dir, 'antigravity.json'),
        JSON.stringify({
          instanceId: 'antigravity',
          driver: 'antigravity',
          usageLimits: {
            checkedAt: now.toISOString(),
            windows: [
              {
                id: 'gemini-5h',
                usedPercent: 0,
                resetsAt: '2026-10-24T04:00:00Z',
              },
            ],
          },
          padding: ' '.repeat(2_000_001),
        })
      );
      const oversized = await collectSnapshot(
        pool('antigravity', 'antigravity'),
        dir
      );
      expect(oversized.windows[0]?.freshnessTtlMs).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
