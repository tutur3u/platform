import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCatalog } from '../src/collectors/catalog';
import { discoverSnapshotInstances } from '../src/collectors/discover';
import { collectT3State } from '../src/collectors/t3';
import { failureClass, safeReceipt } from '../src/failure-receipt';
import { recommend } from '../src/policy';
import { defaultRoutingConfig } from '../src/routing-config';
import type { AccountUsage } from '../src/types';

const temporary: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-quota-discovery-'));
  temporary.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const now = new Date('2026-11-23T03:05:00.000Z');

describe('provider discovery, receipts, catalog and sqlite', () => {
  it('discovers active instances including claude_thanh, claude_personal, grok, cursor, opencode while skipping disabled and symlinks', async () => {
    const dir = await tempDir();
    const writeCache = (file: string, obj: unknown) =>
      writeFile(join(dir, file), JSON.stringify(obj));

    await writeCache('claude_personal.json', {
      instanceId: 'claude_personal',
      driver: 'claudeAgent',
      enabled: true,
      status: 'ready',
      checkedAt: now.toISOString(),
      usageLimits: { checkedAt: now.toISOString(), windows: [] },
    });
    await writeCache('claude_thanh.json', {
      instanceId: 'claude_thanh',
      driver: 'claudeAgent',
      enabled: true,
      status: 'ready',
      checkedAt: now.toISOString(),
      usageLimits: { checkedAt: now.toISOString(), windows: [] },
    });
    await writeCache('grok.json', {
      instanceId: 'grok',
      driver: 'grok',
      enabled: true,
      status: 'ready',
      checkedAt: now.toISOString(),
    });
    await writeCache('cursor.json', {
      instanceId: 'cursor',
      driver: 'cursor',
      enabled: true,
      status: 'ready',
      checkedAt: now.toISOString(),
    });
    await writeCache('opencode.json', {
      instanceId: 'opencode',
      driver: 'opencode',
      enabled: true,
      status: 'ready',
      checkedAt: now.toISOString(),
    });
    await writeCache('fx.json', {
      instanceId: 'fx',
      driver: 'fx',
      enabled: false,
      status: 'disabled',
      checkedAt: now.toISOString(),
    });
    await writeCache('codex_orphan.json', {
      instanceId: 'codex_orphan',
      driver: 'codex',
      enabled: true,
      status: 'error',
      checkedAt: '2026-10-01T00:00:00.000Z',
    });
    await symlink(join(dir, 'grok.json'), join(dir, 'linked.json'));

    const discovered = await discoverSnapshotInstances(dir);
    expect(discovered.map((d) => d.instanceId)).toEqual([
      'claude_personal',
      'claude_thanh',
      'cursor',
      'grok',
      'opencode',
    ]);
  });

  it('classifies Grok 402, Cursor weekly limit, and OpenCode balance exhaustion receipts as usage-limit', () => {
    expect(
      failureClass(
        'API error (status 402 Payment Required): Grok Build usage balance exhausted'
      )
    ).toBe('usage-limit');
    expect(
      failureClass(
        'Weekly usage limit reached. It resets in 4 days. Buy credits to keep going now.'
      )
    ).toBe('usage-limit');
    expect(
      failureClass(
        'Insufficient balance. This request is pay-as-you-go, billed to OpenCode Models credits.'
      )
    ).toBe('usage-limit');
    expect(failureClass('OpenCode Go monthly usage limit reached.')).toBe(
      'usage-limit'
    );
  });

  it('parses all six providers in parseCatalog and collectT3State', async () => {
    const parsed = parseCatalog({
      providers: [
        {
          providerInstanceId: 'grok',
          driverKind: 'grok',
          canRunChildTask: true,
          models: [{ id: 'grok-4.7' }],
        },
        {
          providerInstanceId: 'cursor',
          driverKind: 'cursor',
          canRunChildTask: true,
          models: [{ id: 'composer-2.5' }],
        },
        {
          providerInstanceId: 'opencode',
          driverKind: 'opencode',
          canRunChildTask: true,
          models: [{ id: 'opencode-go/hy4' }],
        },
        {
          providerInstanceId: 'fx',
          driverKind: 'fx',
          canRunChildTask: false,
          constraints: ['Provider instance is disabled.'],
        },
      ],
    });
    expect(parsed.map((p) => p.instanceId)).toEqual([
      'grok',
      'cursor',
      'opencode',
    ]);

    const dir = await tempDir();
    const dbPath = join(dir, 'state.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE orchestration_v2_projection_provider_sessions (provider_instance_id TEXT, provider TEXT);
      CREATE TABLE orchestration_v2_projection_subagents (provider_instance_id TEXT, provider TEXT, status TEXT, child_thread_id TEXT, provider_thread_id TEXT, subagent_id TEXT);
      CREATE TABLE orchestration_v2_projection_runs (provider_instance_id TEXT, thread_id TEXT, status TEXT, payload_json TEXT);
      INSERT INTO orchestration_v2_projection_provider_sessions VALUES ('grok', 'grok'), ('cursor', 'cursor'), ('opencode', 'opencode'), ('claude_thanh', 'claudeAgent');`);
    db.close();
    const t3 = collectT3State(dbPath);
    expect(t3.providerByInstance).toEqual({
      grok: 'grok',
      cursor: 'cursor',
      opencode: 'opencode',
      claude_thanh: 'claude',
    });
  });

  it('redacts xai, GitHub, Google API, JWT, and long hex/base64 secrets in safeReceipt', () => {
    const samples = [
      'error with xai-secretTokenValue123456',
      'ghp_1234567890abcdef1234567890abcdef1234',
      'gho_AbCdEfGhIjKlMnOpQrStUvWxYz123456',
      'github_pat_11ABCDEF0123456789_abcdefghijklmnop',
      'AIzaSyDummyKeyValue1234567890abcdef',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig12345',
      'hex=0123456789abcdef0123456789abcdef',
      'b64=QWxhZGRpbjpvcGVuIHNlc2FtZQ==12',
    ];
    for (const sample of samples) {
      const result = safeReceipt(sample, 'other');
      expect(result.redacted).toBe(true);
      expect(result.text).toContain('[redacted]');
    }
    expect(
      safeReceipt('Weekly usage limit reached in 4 days', 'usage-limit')
        .redacted
    ).toBe(false);
  });

  it('enforces noTopUps/noCreditPurchases/allowCreditsTopUp flags against exhausted balances', () => {
    const grokAccount: AccountUsage = {
      instanceId: 'grok',
      provider: 'grok',
      label: 'Grok',
      available: true,
      models: ['grok-4.7'],
      balance: { remaining: 0, exhausted: true },
      windows: [
        {
          id: 'subscription',
          kind: 'long',
          providerWindowKind: 'weekly',
          windowDurationMins: 10080,
          usedPercent: 20,
          resetsAt: '2026-11-29T00:00:00.000Z',
          observedAt: now.toISOString(),
          authoritative: true,
          source: 'fixture',
        },
      ],
    };
    const blocked = recommend({
      accounts: [grokAccount],
      active: [],
      task: { provider: 'grok' },
      now,
    }).ranked[0]!;
    expect(blocked.eligible).toBe(false);
    expect(blocked.reasons.map((r) => r.code)).toContain('no-top-ups-policy');

    const cfg = defaultRoutingConfig();
    const allowed = recommend({
      accounts: [grokAccount],
      active: [],
      task: { provider: 'grok' },
      now,
      routingConfig: {
        ...cfg,
        noTopUps: false,
        noCreditPurchases: false,
        providers: { ...cfg.providers, grok: { allowCreditsTopUp: true } },
      },
    }).ranked[0]!;
    expect(allowed.eligible).toBe(true);
    expect(allowed.reasons.map((r) => r.code)).toContain(
      'balance-exhausted-topup-allowed'
    );
  });
});
