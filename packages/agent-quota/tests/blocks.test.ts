import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { admit } from '../src/admission';
import {
  createBlock,
  matchesScope,
  readBlockLedger,
  writeBlock,
} from '../src/block-ledger';
import { emptyLedger } from '../src/hook-ledger';
import type { AdmissionContext, AdmissionRequest } from '../src/hooks-types';
import { recommend } from '../src/policy';
import { gateDecision } from '../src/positional-admit';

const now = new Date('2026-10-23T05:30:00Z');
const block = createBlock({
  pool: 'antigravity',
  modelScope: 'gemini-4-argon-*',
  reason: 'Usage Limit Reached resets in 6 days, 23 hours',
  evidence: 'thread/run/terminal',
  observedAt: now.toISOString(),
});
function context(): AdmissionContext {
  return {
    now,
    active: [],
    ledger: emptyLedger(),
    blocks: [block],
    accounts: [
      { instanceId: 'owner', provider: 'claude', label: 'owner', windows: [] },
      {
        instanceId: 'antigravity',
        provider: 'antigravity',
        label: 'AG',
        available: true,
        models: ['gemini-4-argon-high', 'gemini-3.8-flash-low'],
        windows: [
          {
            kind: 'short',
            usedPercent: 10,
            source: 'fixture',
            authoritative: true,
            observedAt: now.toISOString(),
            resetsAt: '2026-11-02T00:00:00Z',
          },
        ],
      },
    ],
  };
}
const request: AdmissionRequest = {
  requestId: 'lane',
  threadId: 'parent',
  currentInstanceId: 'owner',
  requirements: {
    capability: 'implementation',
    authorizedInstanceIds: ['antigravity'],
    privacyApprovedInstanceIds: ['antigravity'],
    candidates: [
      {
        instanceId: 'antigravity',
        model: 'gemini-4-argon-high',
        capabilities: ['implementation'],
      },
    ],
  },
  policy: {
    orchestratorReservePercent: 30,
    nearUsedPercent: 90,
    unknownMaxConcurrent: 1,
  },
};
describe('orchestrator invoked hard-block gate', () => {
  it('keeps an interim block without a deadline blocked', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quota-block-'));
    try {
      const path = join(directory, 'blocks.json');
      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          blocks: [{ ...block, resetAt: null, nextEligibleAt: null }],
        })
      );
      const ctx = context();
      ctx.blocks = (await readBlockLedger(path)).blocks;
      expect(await writeBlock(block, path)).toMatchObject({
        replay: true,
        eligibleAt: null,
      });
      expect(
        gateDecision('antigravity', 'gemini-4-argon-high', ctx).exitCode
      ).toBe(3);
      expect(
        gateDecision('antigravity', 'gemini-3.8-flash-low', ctx).exitCode
      ).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('blocks an exhausted scope in both admission interfaces and recommendations', () => {
    const c = context();
    expect(gateDecision('antigravity', 'gemini-4-argon-high', c)).toMatchObject(
      { status: 'BLOCKED', exitCode: 3 }
    );
    expect(admit(request, c).status).toBe('block');
    expect(
      recommend({
        accounts: c.accounts,
        active: [],
        task: { model: 'gemini-4-argon-high' },
        blocks: c.blocks,
        now,
      }).selected
    ).toEqual([]);
  });
  it('readmits after reset expiry with fresh coverage', () => {
    const c = context();
    c.now = new Date(Date.parse(block.resetAt!) + 1);
    c.accounts[1]!.windows[0]!.observedAt = c.now.toISOString();
    expect(gateDecision('antigravity', 'gemini-4-argon-high', c)).toMatchObject(
      { status: 'ADMIT', exitCode: 0 }
    );
  });
  it('blocks only matching model globs, not Antigravity flash', () => {
    expect(matchesScope('gemini-4-argon-*', 'gemini-4-argon-high')).toBe(true);
    expect(matchesScope('gemini-4-argon-*', 'gemini-3.8-flash-low')).toBe(
      false
    );
    expect(
      gateDecision('antigravity', 'gemini-3.8-flash-low', context()).exitCode
    ).toBe(0);
  });
  it('keeps scoped legacy receipts from blocking other candidate models', () => {
    const c = context();
    c.ledger.observations.push({
      eventId: 'old',
      instanceId: 'antigravity',
      accountKey: 'antigravity:instance:antigravity',
      model: 'gemini-4-argon-high',
      outcome: 'usage-limit',
      observedAt: now.toISOString(),
      resetsAt: block.resetAt!,
    });
    expect(
      admit(
        {
          ...request,
          requirements: {
            ...request.requirements,
            candidates: [
              {
                instanceId: 'antigravity',
                model: 'gemini-3.8-flash-low',
                capabilities: ['implementation'],
              },
            ],
          },
        },
        c
      ).status
    ).toBe('admit');
  });
  it('parses each provider receipt and gives missing resets a conservative next eligibility', () => {
    const make = (reason: string) =>
      createBlock({
        pool: 'worker',
        modelScope: '*',
        reason,
        evidence: reason,
        observedAt: now.toISOString(),
        timezone: 'Asia/Ho_Chi_Minh',
      });
    expect(make('Usage Limit Reached resets in 6 days, 23 hours').resetAt).toBe(
      '2026-10-30T04:30:00.000Z'
    );
    expect(make('rate limit reached resets in 90 seconds').resetAt).toBe(
      '2026-10-23T05:31:30.000Z'
    );
    expect(make("You've hit your session limit · resets 1:20pm").resetAt).toBe(
      '2026-10-23T06:20:00.000Z'
    );
    expect(make('rate limit reached').nextEligibleAt).toBe(
      '2026-10-23T10:30:00.000Z'
    );
  });
  it('refuses owner delegation without fresh headroom and enforces the reserve', () => {
    const c = context();
    c.blocks = [];
    c.accounts[1]!.windows = [];
    expect(
      gateDecision('antigravity', 'gemini-3.8-flash-low', c, true).reasons
    ).toContain('orchestrator-reserve');
    c.accounts[1]!.windows = context().accounts[1]!.windows;
    expect(
      gateDecision('antigravity', 'gemini-3.8-flash-low', c, true).exitCode
    ).toBe(0);
    c.accounts[1]!.windows[0]!.usedPercent = 70;
    expect(
      gateDecision('antigravity', 'gemini-3.8-flash-low', c, true).exitCode
    ).toBe(3);
  });
  it('preserves the interim schema and metadata and records repeated receipts once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-blocks-'));
    const path = join(dir, 'blocks.json');
    try {
      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          note: 'interim fixture',
          blocks: [
            {
              pool: 'claude_mira',
              modelScope: '*',
              reason: 'session limit',
              observedAt: now.toISOString(),
              resetAt: null,
              nextEligibleAt: '2026-10-23T10:30:00Z',
              evidence: ['run/original'],
              resetSource: 'operator',
            },
          ],
        })
      );
      await writeBlock(block, path);
      expect((await writeBlock(block, path)).replay).toBe(true);
      const ledger = await readBlockLedger(path);
      expect(ledger.blocks).toHaveLength(2);
      expect(JSON.parse(await readFile(path, 'utf8')).note).toBe(
        'interim fixture'
      );
      expect(ledger.blocks[0]?.resetSource).toBe('operator');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('fails closed on malformed ledger timestamps', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-invalid-blocks-'));
    try {
      const path = join(dir, 'blocks.json');
      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          blocks: [{ ...block, resetAt: 'not-a-time' }],
        })
      );
      await expect(readBlockLedger(path)).rejects.toThrow(
        'block-ledger-unreadable'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
