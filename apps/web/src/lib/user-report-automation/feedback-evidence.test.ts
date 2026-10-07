import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/supabase';
import { describe, expect, it, vi } from 'vitest';
import {
  boundHumanFeedbackEvidence as boundEvidence,
  type HumanFeedbackEvidence as Evidence,
  type FeedbackEvidenceInput as Input,
  loadHumanFeedbackEvidence as loadEvidence,
  type FeedbackEvidenceMetadata as Metadata,
  type HumanFeedbackRecord as Record,
} from './feedback-evidence';

const wsId = '00000000-0000-0000-0000-000000000001';
const userId = '00000000-0000-0000-0000-000000000002';
const groupId = '00000000-0000-0000-0000-000000000003';
const foreignId = '00000000-0000-0000-0000-000000000004';
const input: Input = {
  wsId,
  userId,
  groupId,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
};
const metadata: Omit<
  Metadata,
  'countReturned' | 'incomplete' | 'omittedAtLeast'
> = {
  ...input,
  timezonePolicy: 'current-workspace',
  workspaceTimezone: 'UTC',
  scheduleTimezone: null,
  scheduleTimezoneMismatch: null,
  startInclusive: '2026-09-01T00:00:00.000Z',
  endExclusive: '2026-10-01T00:00:00.000Z',
};
const record = (index = 1, content = 'Synthetic observation'): Record => ({
  id: `10000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
  userId,
  groupId,
  creatorId: null,
  content,
  requireAttention: true,
  createdAt: '2026-09-15T12:00:00.123456Z',
});
const row = (index = 1) => {
  const value = record(index);
  return {
    id: value.id,
    user_id: value.userId,
    group_id: value.groupId,
    creator_id: value.creatorId,
    content: value.content,
    require_attention: value.requireAttention,
    created_at: value.createdAt,
    user: { ws_id: wsId },
    group: { ws_id: wsId },
  };
};
// Real client serialization with a finite synthetic fetch seam. No network or database.
function clientFixture(
  feedback: unknown = [],
  timezone: unknown = 'UTC',
  failure?: `${'reject-' | 'missing-' | ''}${'workspace' | 'feedback'}`
) {
  const requests: URL[] = [];
  const client = createClient<Database>(
    'https://feedback.invalid',
    'synthetic-key',
    {
      db: { retry: false },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (target) => {
          const url = new URL(
            typeof target === 'string'
              ? target
              : target instanceof URL
                ? target.href
                : target.url
          );
          requests.push(url);
          expect(requests.length).toBeLessThanOrEqual(2);
          const workspace = url.pathname.endsWith('/workspaces');
          const stage = workspace ? 'workspace' : 'feedback';
          if (failure === `reject-${stage}`)
            throw new Error('PRIVATE_SYNTHETIC_SENTINEL');
          const body =
            failure === stage
              ? { message: 'PRIVATE_SYNTHETIC_SENTINEL' }
              : workspace
                ? failure === 'missing-workspace'
                  ? null
                  : { timezone }
                : feedback;
          return new Response(JSON.stringify(body), {
            status: failure === stage ? 500 : 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    }
  );
  return { client, requests };
}
function load(fixture: ReturnType<typeof clientFixture>, tuple = input) {
  return loadEvidence(fixture.client, tuple);
}
function ready(value: Evidence) {
  expect(value.status).toBe('ready');
  if (value.status !== 'ready')
    throw new Error('Expected ready synthetic evidence');
  expect(Buffer.byteLength(JSON.stringify(value), 'utf8')).toBeLessThanOrEqual(
    32768
  );
  return value;
}
function unavailable(
  value: Evidence,
  reason: Exclude<Evidence, { status: 'ready' }>['reason']
) {
  expect(value).toEqual({ status: 'unavailable', reason });
}
function bound(records: Record[]) {
  return ready(boundEvidence(records, metadata));
}
describe('whole-envelope deterministic complete prefix', () => {
  it.each([0, 1, 50, 51])(
    '%i observed rows keep a complete prefix',
    (count) => {
      const records = Array.from({ length: count }, (_, i) => record(i + 1));
      const original = structuredClone(records);
      const result = bound(records);
      expect(records).toEqual(original);
      expect(result.records).toEqual([...original].reverse().slice(0, 50));
      expect(result.metadata).toMatchObject({
        countReturned: Math.min(count, 50),
        incomplete: count > 50,
        omittedAtLeast: Math.max(0, count - 50),
      });
      expect(result.interpretation).toBe('quoted-observation-data');
      expect(result.metadata).not.toHaveProperty('totalCount');
    }
  );
  it('byte guard rejects Unicode oversize while ASCII positive fits', () => {
    expect(bound([record(1, 'x'.repeat(11000))]).records).toHaveLength(1);
    const result = bound(
      [record(1, '界'.repeat(11000)), record(2, 'older')].map((v, i) => ({
        ...v,
        createdAt: i === 0 ? '2026-09-16T00:00:00Z' : '2026-09-15T00:00:00Z',
      }))
    );
    expect(result.records).toEqual([]);
    expect(result.metadata).toMatchObject({
      incomplete: true,
      omittedAtLeast: 2,
      countReturned: 0,
    });
  });
  it('metadata budget includes the entire envelope and exact final counts', () => {
    const small = bound([record(1, 'x')]);
    const capacity = 32768 - Buffer.byteLength(JSON.stringify(small), 'utf8');
    const exact = record(1, 'x'.repeat(capacity + 1));
    const result = bound([exact]);
    expect(result.records).toEqual([exact]);
    expect(Buffer.byteLength(JSON.stringify(result))).toBe(32768);
    const over = bound([record(1, `${exact.content}x`)]);
    expect(over.records).toEqual([]);
    expect(over.metadata).toMatchObject({
      incomplete: true,
      omittedAtLeast: 1,
    });
  });
  it('escaping and count digits fit the final envelope', () => {
    const values = Array.from({ length: 51 }, (_, i) =>
      record(i + 1, '"\n\\界'.repeat(120))
    );
    const result = bound(values);
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.length).toBeLessThan(50);
    expect(result.records).toEqual(
      [...values].reverse().slice(0, result.records.length)
    );
    expect(result.metadata.omittedAtLeast).toBe(51 - result.records.length);
  });
  it('oversized middle record stops prefix before all older observations', () => {
    const values = [
      record(3, 'newest'),
      record(2, 'x'.repeat(32768)),
      record(1, 'oldest'),
    ];
    const result = bound(values);
    expect(result.records).toEqual([values[0]]);
    expect(result.metadata).toMatchObject({
      countReturned: 1,
      incomplete: true,
      omittedAtLeast: 2,
    });
  });
  it('metadata overflow denies while ordinary empty is ready', () => {
    expect(bound([]).metadata.incomplete).toBe(false);
    unavailable(
      boundEvidence([], {
        ...metadata,
        scheduleTimezone: 'x'.repeat(32768),
      }),
      'metadata_overflow'
    );
  });
});
describe('actual loader query and runtime projection', () => {
  it('actual joins, tenant tuple, UTC range, order and limit51', async () => {
    const fixture = clientFixture([row()], 'Asia/Ho_Chi_Minh');
    const result = ready(
      await load(fixture, {
        ...input,
        scheduleTimezone: 'UTC',
      })
    );
    expect(result.records).toEqual([record()]);
    expect(result.metadata).toMatchObject({
      wsId,
      userId,
      groupId,
      workspaceTimezone: 'Asia/Ho_Chi_Minh',
      scheduleTimezone: 'UTC',
      scheduleTimezoneMismatch: true,
    });
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[0]?.searchParams.get('id')).toBe(`eq.${wsId}`);
    const params = fixture.requests[1]?.searchParams;
    expect(params?.get('select')).toBe(
      'id,user_id,group_id,creator_id,content,require_attention,created_at,user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id),group:workspace_user_groups!user_feedbacks_group_id_fkey!inner(ws_id)'
    );
    expect(params?.get('user.ws_id')).toBe(`eq.${wsId}`);
    expect(params?.get('group.ws_id')).toBe(`eq.${wsId}`);
    expect(params?.get('user_id')).toBe(`eq.${userId}`);
    expect(params?.get('group_id')).toBe(`eq.${groupId}`);
    expect(params?.getAll('created_at')).toEqual([
      'gte.2026-08-31T17:00:00.000Z',
      'lt.2026-09-30T17:00:00.000Z',
    ]);
    expect(params?.get('order')).toBe('created_at.desc,id.desc');
    expect(params?.get('limit')).toBe('51');
  });
  it('empty success differs from errors, rejections and malformed data', async () => {
    const success = clientFixture();
    const result = ready(await load(success));
    expect(result.records).toEqual([]);
    expect(result.metadata).toMatchObject({
      countReturned: 0,
      incomplete: false,
      omittedAtLeast: 0,
      scheduleTimezone: null,
      scheduleTimezoneMismatch: null,
    });
    for (const failure of [
      'workspace',
      'feedback',
      'reject-workspace',
      'reject-feedback',
    ] as const) {
      const fixture = clientFixture([], 'UTC', failure);
      expect(await load(fixture)).toEqual({
        status: 'unavailable',
        reason: failure.includes('workspace')
          ? 'workspace_unavailable'
          : 'feedback_unavailable',
      });
    }
    const missing = clientFixture([], 'UTC', 'missing-workspace');
    unavailable(await load(missing), 'workspace_unavailable');
    for (const data of [null, {}, 'malformed', [null]]) {
      const fixture = clientFixture(data);
      unavailable(await load(fixture), 'feedback_unavailable');
    }
  });
  it.each([
    { user: { ws_id: foreignId } },
    { group: { ws_id: foreignId } },
    { user: null },
    { group: null },
    { group: [] },
    { user_id: foreignId },
    { group_id: foreignId },
    { group_id: null },
    { id: null },
    { creator_id: 7 },
    { require_attention: null },
    { content: null },
    { created_at: '2026-02-30T00:00:00Z' },
    { created_at: 'invalid' },
    { created_at: '2026-10-01T00:00:00Z' },
    { created_at: '2026-08-31T23:59:59.999999Z' },
  ])('foreign or malformed row %j denies', async (delta) => {
    const fixture = clientFixture([{ ...row(), ...delta }]);
    unavailable(await load(fixture), 'feedback_unavailable');
  });
  it('exact start and last microsecond included, exact end excluded', async () => {
    const rows = [
      { ...row(1), created_at: '2026-09-01T00:00:00Z' },
      { ...row(2), created_at: '2026-09-30T23:59:59.999999Z' },
    ];
    const fixture = clientFixture(rows);
    expect(ready(await load(fixture)).records.map((v) => v.id)).toEqual([
      row(2).id,
      row(1).id,
    ]);
    const end = clientFixture([
      { ...row(), created_at: '2026-10-01T00:00:00Z' },
    ]);
    unavailable(await load(end), 'feedback_unavailable');
  });
  it('51 query rows retain 50 with lower-bound omission', async () => {
    const fixture = clientFixture(
      Array.from({ length: 51 }, (_, i) => row(i + 1))
    );
    const result = ready(await load(fixture));
    expect(result.records).toEqual(
      Array.from({ length: 50 }, (_, i) => record(51 - i))
    );
    expect(result.metadata).toMatchObject({
      omittedAtLeast: 1,
      incomplete: true,
      countReturned: 50,
    });
  });
  it.each([null, '', 'Invalid/Zone', 17])(
    'zone %s denies without a fallback',
    async (zone) => {
      const fixture = clientFixture([], zone);
      unavailable(await load(fixture), 'timezone_unavailable');
      expect(fixture.requests).toHaveLength(1);
    }
  );
  it('known and changed zones disclose schedule mismatch', async () => {
    const equal = clientFixture([], 'UTC');
    expect(
      ready(
        await load(equal, {
          ...input,
          scheduleTimezone: 'UTC',
        })
      ).metadata.scheduleTimezoneMismatch
    ).toBe(false);
    const changed = clientFixture([], 'Asia/Ho_Chi_Minh');
    const result = ready(
      await load(changed, {
        ...input,
        scheduleTimezone: 'UTC',
      })
    );
    expect(result.metadata).toMatchObject({
      scheduleTimezoneMismatch: true,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      startInclusive: '2026-08-31T17:00:00.000Z',
    });
  });

  it('invalid tuple and dates deny before feedback query', async () => {
    const fixture = clientFixture();
    unavailable(
      await load(fixture, {
        ...input,
        groupId: '',
      }),
      'invalid_input'
    );
    expect(fixture.requests).toHaveLength(0);
    unavailable(
      await load(fixture, {
        ...input,
        periodEnd: '2026-08-31',
      }),
      'invalid_period'
    );
    expect(fixture.requests).toHaveLength(1);
  });
  it('failures emit no raw error/data logs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fixture = clientFixture([], 'UTC', 'feedback');
      const result = await load(fixture);
      expect(JSON.stringify(result)).not.toContain(
        'PRIVATE_SYNTHETIC_SENTINEL'
      );
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });
});
