import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FeatureFlagApiResult,
  FeatureFlagRule,
  FeatureFlagsAdminClient,
} from '../platform-feature-flags';
import type { TuturuuuUserClient } from '../platform';
import { FLAGS_EXIT, flagsHelp, runFlagsCommand } from './flags';

const WS = '33333333-3333-4333-8333-333333333333';
const OP = '22222222-2222-4222-8222-222222222222';

function rule(partial: Partial<FeatureFlagRule> = {}): FeatureFlagRule {
  return {
    environment: 'production',
    flagKey: 'MEET_UX_V2',
    revision: 3,
    rule: { mode: 'staff' },
    scope: 'platform',
    subjectId: null,
    updatedAt: '2026-11-25T00:00:00Z',
    ...partial,
  };
}

const ok = <T>(data: T): FeatureFlagApiResult<T> => ({
  data,
  ok: true,
  status: 200,
});

function harness(
  overrides: Partial<Record<'rules' | 'setRule' | 'audit', unknown>> = {}
) {
  const featureFlags = {
    audit: vi.fn(async () => ok({ rows: [] })),
    rules: vi.fn(async () => ok({ nextCursor: null, rules: [rule()] })),
    setRule: vi.fn(async (input: { flagKey: string; mode: string | null }) =>
      ok({
        environment: 'production',
        flagKey: input.flagKey,
        newRule: { mode: input.mode },
        oldRule: { mode: 'staff' },
        operationId: OP,
        revision: 4,
        scope: 'platform',
        status: 'applied',
        subjectId: null,
      })
    ),
    ...overrides,
  };
  const lines: string[] = [];
  const run = (
    positionals: string[],
    flags: Record<string, string | boolean> = {},
    json = true
  ) =>
    runFlagsCommand({
      api: featureFlags as unknown as FeatureFlagsAdminClient,
      client: {} as TuturuuuUserClient,
      flags,
      json,
      out: (text) => lines.push(text),
      positionals,
    });
  return { featureFlags, lines, run };
}

beforeEach(() => {
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = undefined;
});

describe('ttr flags', () => {
  it('lists rules and filters by scope and subject', async () => {
    const { featureFlags, lines, run } = harness({
      rules: vi.fn(async () =>
        ok({
          nextCursor: null,
          rules: [
            rule(),
            rule({ revision: 1, scope: 'workspace', subjectId: WS }),
          ],
        })
      ),
    });
    await run(['list'], { workspace: WS });
    expect(JSON.parse(lines[0]!)).toMatchObject({
      ok: true,
      rules: [{ scope: 'workspace', subjectId: WS }],
    });
    expect(process.exitCode).toBeUndefined();
    expect(featureFlags.rules).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'production' })
    );
  });

  it('pages only with --all', async () => {
    const cursor = {
      flagKey: 'A',
      scope: 'platform' as const,
      subjectId: null,
    };
    const rules = vi.fn(async (options: { after?: unknown }) =>
      options.after
        ? ok({ nextCursor: null, rules: [rule({ flagKey: 'B' })] })
        : ok({ nextCursor: cursor, rules: [rule()] })
    );
    const { lines, run } = harness({ rules });
    await run(['list']);
    expect(rules).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lines[0]!).rules).toHaveLength(1);
    await run(['list'], { all: true });
    expect(rules).toHaveBeenCalledTimes(3);
    expect(rules).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: cursor })
    );
    expect(JSON.parse(lines[1]!).rules).toHaveLength(2);
  });

  it('gets one rule and exits 4 when none is stored', async () => {
    const { lines, run } = harness();
    await run(['get', 'MEET_UX_V2']);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      ok: true,
      rule: { revision: 3 },
    });
    await run(['get', 'OTHER_FLAG'], { workspace: WS });
    expect(process.exitCode).toBe(FLAGS_EXIT.notFound);
    expect(JSON.parse(lines[1]!)).toEqual({ error: 'not_found', ok: false });
  });

  it('requires --confirm KEY for a production write and previews with --dry-run', async () => {
    const { featureFlags, lines, run } = harness();
    await run(['set', 'MEET_UX_V2'], { mode: 'on', reason: 'Ship' });
    expect(process.exitCode).toBe(FLAGS_EXIT.usage);
    expect(featureFlags.setRule).not.toHaveBeenCalled();
    process.exitCode = undefined;
    await run(['set', 'MEET_UX_V2'], {
      'dry-run': true,
      mode: 'on',
      reason: 'Ship',
    });
    expect(featureFlags.setRule).not.toHaveBeenCalled();
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ dryRun: true, ok: true });
    expect(process.exitCode).toBeUndefined();
  });

  it('reads the current revision, sends the CAS write and reports the result', async () => {
    const { featureFlags, lines, run } = harness();
    await run(['set', 'MEET_UX_V2'], {
      confirm: 'MEET_UX_V2',
      mode: 'on',
      'operation-id': OP,
      reason: 'Ship it',
    });
    expect(featureFlags.setRule).toHaveBeenCalledWith({
      allowUserIds: undefined,
      allowWorkspaceIds: undefined,
      environment: 'production',
      expectedRevision: 3,
      flagKey: 'MEET_UX_V2',
      mode: 'on',
      operationId: OP,
      percentage: undefined,
      reason: 'Ship it',
      scope: 'platform',
      subjectId: null,
    });
    expect(JSON.parse(lines[0]!)).toMatchObject({
      key: 'MEET_UX_V2',
      mode: 'on',
      ok: true,
      operationId: OP,
      revision: 4,
      status: 'applied',
    });
  });

  it('uses revision 0 for a rule that does not exist and an explicit revision as given', async () => {
    const empty = harness({
      rules: vi.fn(async () => ok({ nextCursor: null, rules: [] })),
    });
    await empty.run(['set', 'NEW_FLAG'], {
      confirm: 'NEW_FLAG',
      env: 'development',
      mode: 'off',
      reason: 'x',
    });
    expect(empty.featureFlags.setRule).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 0,
        environment: 'development',
      })
    );
    const explicit = harness();
    await explicit.run(['set', 'F'], {
      confirm: 'F',
      'expected-revision': '9',
      mode: 'off',
      reason: 'x',
    });
    expect(explicit.featureFlags.rules).not.toHaveBeenCalled();
    expect(explicit.featureFlags.setRule).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 9 })
    );
  });

  it('unsets with a null mode and builds rollout rules', async () => {
    const { featureFlags, run } = harness();
    await run(['unset', 'MEET_UX_V2'], {
      confirm: 'MEET_UX_V2',
      reason: 'Clean up',
      workspace: WS,
    });
    expect(featureFlags.setRule).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: null, scope: 'workspace', subjectId: WS })
    );
    await run(['set', 'MEET_UX_V2'], {
      'allow-workspaces': `${WS},${OP}`,
      confirm: 'MEET_UX_V2',
      mode: 'rollout',
      percent: '10',
      reason: 'Canary',
    });
    expect(featureFlags.setRule).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowWorkspaceIds: [WS, OP],
        mode: 'rollout',
        percentage: 10,
      })
    );
  });

  it('rejects malformed input before any request', async () => {
    const { featureFlags, run } = harness();
    const bad: Array<[string[], Record<string, string | boolean>]> = [
      [['set'], { mode: 'on', reason: 'x' }],
      [['set', 'F'], { confirm: 'F', mode: 'maybe', reason: 'x' }],
      [['set', 'F'], { confirm: 'F', mode: 'on' }],
      [['set', 'F'], { confirm: 'F', mode: 'on', percent: '5', reason: 'x' }],
      [['set', 'F'], { confirm: 'F', mode: 'rollout', reason: 'x' }],
      [
        ['set', 'F'],
        { confirm: 'F', mode: 'on', reason: 'x', workspace: 'nope' },
      ],
      [
        ['set', 'F'],
        { confirm: 'F', mode: 'on', reason: 'x', user: WS, workspace: WS },
      ],
      [['set', 'F'], { confirm: 'F', env: 'staging', mode: 'on', reason: 'x' }],
      [
        ['set', 'F'],
        { confirm: 'F', 'operation-id': 'nope', mode: 'on', reason: 'x' },
      ],
      [
        ['set', 'F'],
        { confirm: 'F', 'expected-revision': '-1', mode: 'on', reason: 'x' },
      ],
      [
        ['set', 'F'],
        { confirm: 'F', mode: 'on', reason: 'x', scope: 'workspace' },
      ],
      [['bogus'], {}],
    ];
    for (const [positionals, flags] of bad) {
      process.exitCode = undefined;
      await run(positionals, flags);
      expect(process.exitCode, JSON.stringify([positionals, flags])).toBe(
        FLAGS_EXIT.usage
      );
    }
    expect(featureFlags.setRule).not.toHaveBeenCalled();
  });

  it('maps API failures to exit codes without echoing anything else', async () => {
    const cases: Array<[number, string, number]> = [
      [409, 'conflict', FLAGS_EXIT.conflict],
      [409, 'feature_flag_operation_mismatch', FLAGS_EXIT.rejected],
      [409, 'feature_flag_subject_erasing', FLAGS_EXIT.rejected],
      [403, 'denied', FLAGS_EXIT.forbidden],
      [401, 'denied', FLAGS_EXIT.forbidden],
      [404, 'feature_flag_unknown_flag', FLAGS_EXIT.notFound],
      [503, 'storage_unavailable', FLAGS_EXIT.unavailable],
      [422, 'feature_flag_invalid_mode', FLAGS_EXIT.usage],
    ];
    for (const [status, error, code] of cases) {
      const { lines, run } = harness({
        setRule: vi.fn(async () => ({ error, ok: false, revision: 7, status })),
      });
      process.exitCode = undefined;
      await run(['set', 'F'], {
        confirm: 'F',
        'expected-revision': '1',
        mode: 'on',
        reason: 'x',
      });
      expect(process.exitCode, `${status} ${error}`).toBe(code);
      expect(JSON.parse(lines[0]!)).toEqual({ error, ok: false, revision: 7 });
    }
  });

  it('pages through every rule when filtering by scope or subject', async () => {
    const cursor = {
      flagKey: 'A',
      scope: 'platform' as const,
      subjectId: null,
    };
    const rules = vi.fn(async (options: { after?: unknown }) =>
      options.after
        ? ok({
            nextCursor: null,
            rules: [rule({ flagKey: 'B', scope: 'workspace', subjectId: WS })],
          })
        : ok({ nextCursor: cursor, rules: [rule()] })
    );
    const { lines, run } = harness({ rules });
    await run(['list'], { workspace: WS });
    expect(rules).toHaveBeenCalledTimes(2);
    expect(JSON.parse(lines[0]!).rules).toHaveLength(1);
  });

  it('reports an incomplete scan instead of a missing rule', async () => {
    const cursor = {
      flagKey: 'A',
      scope: 'platform' as const,
      subjectId: null,
    };
    const rules = vi.fn(async () =>
      ok({
        nextCursor: cursor,
        rules: [rule({ scope: 'workspace', subjectId: WS })],
      })
    );
    const { lines, run } = harness({ rules });
    await run(['get', 'MEET_UX_V2']);
    expect(process.exitCode).toBe(FLAGS_EXIT.unavailable);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      error: 'rule_scan_incomplete',
    });
  });

  it('builds the client for the infrastructure origin', async () => {
    const options: string[] = [];
    const client = {
      getClientOptions: (baseUrl?: string) => {
        options.push(baseUrl ?? 'default');
        return {
          baseUrl: baseUrl ?? 'https://tuturuuu.com',
          fetch: async () => new Response('{}', { status: 503 }),
        };
      },
    } as unknown as TuturuuuUserClient;
    const lines: string[] = [];
    await runFlagsCommand({
      client,
      flags: {},
      json: true,
      out: (text) => lines.push(text),
      positionals: ['list'],
    }).catch(() => undefined);
    expect(options).toEqual(['default', 'https://infrastructure.tuturuuu.com']);
  });

  it('prints audit rows, optionally for one flag', async () => {
    const row = {
      client: 'ttr',
      environment: 'production',
      flagKey: 'MEET_UX_V2',
      id: OP,
      newRevision: 4,
      newRule: { mode: 'on' },
      oldRevision: 3,
      oldRule: { mode: 'staff' },
      occurredAt: '2026-11-25T00:00:00Z',
      operationId: OP,
      reason: 'Ship',
      scope: 'platform',
      subjectId: null,
      actorId: null,
    };
    const { featureFlags, lines, run } = harness({
      audit: vi.fn(async () =>
        ok({ rows: [row, { ...row, flagKey: 'OTHER' }] })
      ),
    });
    await run(['audit', 'MEET_UX_V2'], { limit: '20' });
    expect(featureFlags.audit).toHaveBeenCalledWith({ limit: 20 });
    expect(JSON.parse(lines[0]!).rows).toHaveLength(1);
    await run(['audit'], {}, false);
    expect(lines[1]).toContain('staff -> on');
    const dirty = harness({
      audit: vi.fn(async () =>
        ok({ rows: [{ ...row, reason: 'ok\u001b[2Jbad' }] })
      ),
    });
    await dirty.run(['audit'], {}, false);
    expect(dirty.lines[0]).not.toContain('\u001b');
  });

  it('documents the exit codes', () => {
    expect(flagsHelp()).toContain('2 revision conflict');
    expect(flagsHelp()).toContain('--confirm KEY');
  });
});
