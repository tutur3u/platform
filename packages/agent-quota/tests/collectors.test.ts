import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { collectAllWith } from '../src/collectors';
import { collectClaude } from '../src/collectors/claude';
import { collectCodex } from '../src/collectors/codex';
import { collectT3State } from '../src/collectors/t3';
import { recommend } from '../src/policy';

const temporary: string[] = [];
async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'agent-quota-'));
  temporary.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('local collectors', () => {
  it('collects Codex authoritative windows and recent token counts', async () => {
    const root = await tempDir();
    const sessions = join(root, 'sessions');
    await mkdir(sessions);
    const observedAt = new Date().toISOString();
    const resetsAt = Math.floor(Date.now() / 1000) + 3600;
    await writeFile(
      join(sessions, 'fixture.jsonl'),
      `${JSON.stringify({
        timestamp: observedAt,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: { input_tokens: 17, output_tokens: 9 } },
          rate_limits: {
            primary: {
              used_percent: 28,
              window_minutes: 300,
              resets_at: resetsAt,
            },
            secondary: {
              used_percent: 45,
              window_minutes: 10080,
              resets_at: resetsAt,
            },
          },
        },
      })}\n`
    );
    const result = await collectCodex('codex', 'test-account', [root]);
    expect(
      result.windows.find((window) => window.kind === 'short')?.usedPercent
    ).toBe(28);
    expect(
      result.windows.find((window) => window.kind === 'long')?.usedPercent
    ).toBe(45);
    expect(
      result.windows.find((window) => window.kind === 'short')?.resetsAt
    ).toBe(new Date(resetsAt * 1000).toISOString());
    expect(
      result.windows.find((window) => window.kind === 'session')?.estimated
    ).toBe(26);
    expect(
      result.windows.filter((window) => window.authoritative)
    ).toHaveLength(2);
    expect(
      result.windows.find((window) => window.kind === 'short')?.observedAt
    ).toBe(observedAt);
  });

  it('uses root timestamps for payload samples and chooses newest token usage', async () => {
    const root = await tempDir();
    const sessions = join(root, 'sessions');
    await mkdir(sessions);
    const newest = new Date().toISOString();
    const older = new Date(Date.parse(newest) - 60 * 60_000).toISOString();
    const row = (timestamp: string, used: number, input: number) => ({
      timestamp,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: input, output_tokens: 9 } },
        rate_limits: {
          primary: {
            used_percent: used,
            window_minutes: 300,
            resets_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
      },
    });
    await writeFile(
      join(sessions, 'fixture.jsonl'),
      `${JSON.stringify(row(newest, 31, 100))}\n${JSON.stringify(row(older, 72, 1))}\n`
    );

    const result = await collectCodex('codex', 'test-account', [root]);
    const ranking = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [result],
      now: new Date(),
    });
    expect(
      result.windows.find((window) => window.kind === 'short')
    ).toMatchObject({
      usedPercent: 31,
      observedAt: newest,
      authoritative: true,
    });
    expect(
      result.windows.find((window) => window.kind === 'session')?.estimated
    ).toBe(109);
    expect(ranking.ranked[0]?.eligible).toBe(true);
  });

  it('keeps old and missing session timestamps stale or unknown', async () => {
    const root = await tempDir();
    const sessions = join(root, 'sessions');
    await mkdir(sessions);
    const old = new Date(Date.now() - 60 * 60_000).toISOString();
    const reset = Math.floor(Date.now() / 1000) + 3600;
    const base = {
      type: 'event_msg',
      payload: {
        type: 'token_count',
        rate_limits: {
          primary: {
            used_percent: 100,
            window_minutes: 300,
            resets_at: reset,
          },
        },
      },
    };
    await writeFile(
      join(sessions, 'fixture.jsonl'),
      `${JSON.stringify({ ...base, timestamp: old })}\n${JSON.stringify(base)}\n`
    );

    const result = await collectCodex('codex', 'test-account', [root]);
    const window = result.windows.find((item) => item.kind === 'short');
    expect(window?.observedAt).toBe(old);
    expect(window?.authoritative).toBe(true);
    const ranking = recommend({
      task: { provider: 'codex' },
      active: [],
      accounts: [result],
      now: new Date(),
    });
    expect(ranking.ranked[0]?.eligible).toBe(false);
    expect(
      ranking.ranked[0]?.reasons.some((reason) => reason.code === 'stale')
    ).toBe(true);

    await writeFile(join(sessions, 'fixture.jsonl'), JSON.stringify(base));
    const missingTimestamp = await collectCodex('codex', 'test-account', [
      root,
    ]);
    const unknownWindow = missingTimestamp.windows.find(
      (item) => item.kind === 'short'
    );
    expect(unknownWindow?.authoritative).toBe(false);
    expect(unknownWindow?.observedAt).toBe('');
  });

  it('prefers the bounded Codex app-server rate limit snapshot', async () => {
    const root = await tempDir();
    const command = join(root, 'codex-app-server-fixture');
    await writeFile(
      command,
      `#!/bin/sh\nwhile IFS= read -r line; do\n  case "$line" in\n    *'"id":1'*) printf '%s\\n' '{"jsonrpc":"2.0","id":1,"result":{}}' ;;\n    *'account/rateLimits/read'*) printf '%s\\n' '{"jsonrpc":"2.0","id":2,"result":{"rateLimits":{"primary":{"usedPercent":31,"windowDurationMins":300,"resetsAt":1900000000},"secondary":{"usedPercent":62,"windowDurationMins":10080,"resetsAt":1900600000}}}}'; break ;;\n  esac\ndone\n`
    );
    await chmod(command, 0o755);
    const result = await collectCodex('codex', 'test-account', [root], {
      command,
      timeoutMs: 1000,
      now: () => new Date('2026-10-23T00:00:00.000Z'),
    });
    expect(result.windows.filter((window) => window.authoritative)).toEqual([
      expect.objectContaining({
        kind: 'short',
        usedPercent: 31,
        source: 'Codex app-server account/rateLimits/read',
      }),
      expect.objectContaining({
        kind: 'long',
        usedPercent: 62,
        source: 'Codex app-server account/rateLimits/read',
      }),
    ]);
  });

  it('retains monthly Codex telemetry but leaves model-gating scope unknown', async () => {
    const root = await tempDir();
    const command = join(root, 'codex-app-server-monthly-fixture');
    await writeFile(
      command,
      `#!/bin/sh\nwhile IFS= read -r line; do\n  case "$line" in\n    *'"id":1'*) printf '%s\\n' '{"jsonrpc":"2.0","id":1,"result":{}}' ;;\n    *'account/rateLimits/read'*) printf '%s\\n' '{"jsonrpc":"2.0","id":2,"result":{"rateLimits":{"primary":{"usedPercent":100,"windowDurationMins":43200,"resetsAt":"2026-11-19T07:28:47Z"}}}}'; break ;;\n  esac\ndone\n`
    );
    await chmod(command, 0o755);
    const result = await collectCodex('codex', 'test-account', [root], {
      command,
      timeoutMs: 1000,
      now: () => new Date('2026-10-25T04:08:45Z'),
    });
    expect(result.windows[0]).toMatchObject({
      providerWindowKind: 'monthly',
      usedPercent: 100,
      resetsAt: '2026-11-19T07:28:47.000Z',
      scope: { kind: 'unknown' },
    });
    const ranked = recommend({
      accounts: [result],
      active: [],
      task: { model: 'gpt-6-luna' },
      now: new Date('2026-10-25T04:08:45Z'),
    }).ranked[0];
    expect(ranked).toMatchObject({ state: 'UNKNOWN', eligible: false });
  });

  it('estimates Claude token totals without fabricating a quota percentage', async () => {
    const root = await tempDir();
    const project = join(root, 'project');
    await mkdir(project);
    await writeFile(
      join(project, 'fixture.jsonl'),
      `${JSON.stringify({
        type: 'assistant',
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        message: { usage: { input_tokens: 1000, output_tokens: 1000 } },
      })}\n${JSON.stringify({
        type: 'assistant',
        timestamp: new Date().toISOString(),
        message: { usage: { input_tokens: 12, output_tokens: 8 } },
      })}\n`
    );
    const result = await collectClaude('claudeAgent', 'test-account', root);
    expect(result.recentTokens).toMatchObject({ input: 12, output: 8 });
    expect(result.windows[0]).toMatchObject({
      kind: 'session',
      estimated: 20,
      authoritative: false,
    });
    expect(result.windows[0]?.usedPercent).toBeUndefined();
  });

  it("collects a Claude rate-limit event's reported utilization and reset", async () => {
    const root = await tempDir();
    const observedAt = new Date().toISOString();
    const resetsAt = Math.floor(Date.now() / 1000) + 10 * 60;
    await writeFile(
      join(root, 'fixture.jsonl'),
      `${JSON.stringify({
        type: 'rate_limit_event',
        timestamp: observedAt,
        rate_limit_info: {
          rateLimitType: 'five_hour',
          utilization: 0.74,
          resetsAt,
        },
      })}\n`
    );
    const result = await collectClaude('claudeAgent', 'test-account', root);
    expect(result.windows[0]).toMatchObject({
      kind: 'short',
      usedPercent: 74,
      resetsAt: new Date(resetsAt * 1000).toISOString(),
      authoritative: true,
    });
  });

  it('does not make an undated Claude rate-limit event fresh from file mtime', async () => {
    const root = await tempDir();
    const resetsAt = Math.floor(Date.now() / 1000) + 10 * 60;
    await writeFile(
      join(root, 'fixture.jsonl'),
      `${JSON.stringify({
        type: 'rate_limit_event',
        rate_limit_info: {
          rateLimitType: 'five_hour',
          utilization: 1,
          resetsAt,
        },
      })}\n`
    );

    const result = await collectClaude('claudeAgent', 'test-account', root);
    expect(result.windows.filter((window) => window.authoritative)).toEqual([]);
  });

  it('ignores expired and old resetless Claude rate-limit events', async () => {
    const root = await tempDir();
    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString();
    const expired = Math.floor(Date.now() / 1000) - 60;
    await writeFile(
      join(root, 'fixture.jsonl'),
      [
        {
          type: 'rate_limit_event',
          timestamp: new Date().toISOString(),
          rate_limit_info: {
            rateLimitType: 'five_hour',
            utilization: 1,
            resetsAt: expired,
          },
        },
        {
          type: 'rate_limit_event',
          timestamp: old,
          rate_limit_info: {
            rateLimitType: 'seven_day',
            utilization: 1,
          },
        },
        {
          type: 'assistant',
          timestamp: new Date().toISOString(),
          message: { content: 'Usage limit reached' },
        },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n')
    );
    const result = await collectClaude('claudeAgent', 'test-account', root);
    expect(
      result.windows.some((window) => window.usedPercent !== undefined)
    ).toBe(false);
  });

  it('reads only safe T3 assignment metadata in read-only mode', async () => {
    const root = await tempDir();
    const path = join(root, 'state.sqlite');
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE orchestration_v2_projection_provider_sessions (provider_instance_id TEXT, provider TEXT, updated_at TEXT);
      CREATE TABLE orchestration_v2_projection_subagents (provider_instance_id TEXT, provider TEXT, status TEXT, started_at TEXT, child_thread_id TEXT, provider_thread_id TEXT, subagent_id TEXT);
      CREATE TABLE orchestration_v2_projection_runs (provider_instance_id TEXT, thread_id TEXT, status TEXT, payload_json TEXT);
      INSERT INTO orchestration_v2_projection_provider_sessions VALUES ('codex', 'codex', '2026-10-23T01:00:00Z');
      INSERT INTO orchestration_v2_projection_subagents VALUES ('codex', 'codex', 'running', '2026-10-23T01:00:00Z', 'child', NULL, 'task');
      INSERT INTO orchestration_v2_projection_runs VALUES ('codex', 'child', 'running', '{}');
      INSERT INTO orchestration_v2_projection_runs VALUES ('codex', 'held', 'queued', '{"queueHeld":true}');`);
    db.close();
    const result = collectT3State(path);
    expect(result.quotaSnapshotsFound).toBe(false);
    expect(result.providerByInstance).toEqual({ codex: 'codex' });
    expect(result.activeAssignments).toEqual([
      { instanceId: 'codex', count: 1, reservationIds: ['child'] },
    ]);
    expect(() =>
      new DatabaseSync(path, { readOnly: true }).exec(
        'CREATE TABLE should_not_exist (id INTEGER)'
      )
    ).toThrow();
  });

  it('returns provider data but leaves activity unknown when T3 state fails', async () => {
    const account = {
      instanceId: 'fixture',
      provider: 'codex' as const,
      label: 'fixture',
      windows: [],
    };
    const result = await collectAllWith({
      collectT3State: () => Promise.reject(new Error('fixture failure')),
      collectCatalog: async () => [],
      collectClaude: async () => ({ ...account, provider: 'claude' as const }),
      collectCodex: async () => account,
      collectSnapshot: async (value) => value,
      readBlockLedger: async () => ({ version: 1 as const, blocks: [] }),
    });
    expect(result.accounts).toHaveLength(8);
    expect(result.active).toBeUndefined();
    expect(result.t3Error).toBe('T3 activity state is unavailable.');
  });
});
