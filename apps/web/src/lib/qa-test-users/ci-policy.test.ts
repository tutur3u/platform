import { describe, expect, it, vi } from 'vitest';
import {
  admitCiCleanup,
  admitCiCreate,
  admitCiTarget,
  QA_CI_PURPOSE,
} from './ci-policy';
import { createQaUsersSchema } from './policy';
import type { QaUserRow } from './store';

const OP = '33333333-3333-4333-8333-333333333333';
const HUMAN = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-11-24T12:00:00Z');
const hoursAgo = (hours: number) =>
  new Date(NOW - hours * 60 * 60_000).toISOString();

let serial = 0;
const row = (overrides: Partial<QaUserRow> = {}): QaUserRow => ({
  userId: `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
  email: 'qa+abcd1234-1@tutur3u.com',
  runId: 'abcd1234',
  ordinal: 1,
  staff: false,
  tier: 'FREE',
  state: 'active',
  purpose: QA_CI_PURPOSE,
  operatorUserId: OP,
  expiresAt: hoursAgo(-2),
  runWorkspaceId: null,
  createdAt: hoursAgo(1),
  deletedAt: null,
  ...overrides,
});
const store = (rows: QaUserRow[]) => ({
  listUsers: vi.fn(async (runId: string | null) =>
    rows.filter((candidate) => runId === null || candidate.runId === runId)
  ),
});
const input = (body: Record<string, unknown>) =>
  createQaUsersSchema.parse(body);
const newRun = (body: Record<string, unknown> = {}) =>
  input({ count: 3, purpose: 'upskii-e2e', ttlSeconds: 3600, ...body });

describe('admitCiCreate', () => {
  it('admits a new upskii-e2e run within every cap', async () => {
    expect(
      await admitCiCreate(store([]), OP, newRun({ workspace: true }), NOW)
    ).toBeNull();
    expect(
      await admitCiCreate(
        store([]),
        OP,
        newRun({ count: 1, staff: true, tier: 'pro' }),
        NOW
      )
    ).toBeNull();
  });

  it.each([
    ['purpose', newRun({ purpose: 'meet-load' })],
    ['ttl', newRun({ ttlSeconds: 7201 })],
    ['count', newRun({ count: 5 })],
    ['staff', newRun({ count: 2, staff: true })],
    ['tier', newRun({ tier: 'plus' })],
  ])('refuses a request over the %s cap', async (reason, body) => {
    expect(await admitCiCreate(store([]), OP, body, NOW)).toEqual({
      status: 403,
      reason,
    });
  });

  it('allows the maximum two-hour TTL', async () => {
    expect(
      await admitCiCreate(store([]), OP, newRun({ ttlSeconds: 7200 }), NOW)
    ).toBeNull();
  });

  it('refuses the 13th new run in a rolling 24 hours', async () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row({ runId: `run0000${index.toString(16)}`, createdAt: hoursAgo(23) })
    );
    expect(await admitCiCreate(store(rows), OP, newRun(), NOW)).toEqual({
      status: 429,
      reason: 'daily_runs',
    });
  });

  it('counts deleted runs, but not older runs or other operators', async () => {
    const rows = [
      ...Array.from({ length: 11 }, (_, index) =>
        row({
          runId: `run0000${index.toString(16)}`,
          state: 'deleted',
          createdAt: hoursAgo(2),
        })
      ),
      row({ runId: 'old00001', createdAt: hoursAgo(25) }),
      row({ runId: 'human001', operatorUserId: HUMAN }),
      row({ runId: 'other001', purpose: 'meet-load' }),
    ];
    expect(await admitCiCreate(store(rows), OP, newRun(), NOW)).toBeNull();
    rows.push(row({ runId: 'run0000b', createdAt: hoursAgo(3) }));
    expect(await admitCiCreate(store(rows), OP, newRun(), NOW)).toMatchObject({
      reason: 'daily_runs',
    });
  });

  it('fails closed when the ledger window does not cover 24 hours', async () => {
    const rows = Array.from({ length: 500 }, () =>
      row({ runId: 'busyrun1', operatorUserId: HUMAN, createdAt: hoursAgo(1) })
    );
    expect(await admitCiCreate(store(rows), OP, newRun(), NOW)).toEqual({
      status: 429,
      reason: 'daily_window_unverifiable',
    });
  });

  describe('adding to an existing run', () => {
    const add = (body: Record<string, unknown>) =>
      input({ runId: 'abcd1234', count: 1, ...body });

    it('admits accounts up to four per run and one staff host', async () => {
      const rows = [row({ staff: true }), row(), row({ state: 'deleted' })];
      expect(await admitCiCreate(store(rows), OP, add({}), NOW)).toBeNull();
      expect(
        await admitCiCreate(store(rows), OP, add({ count: 2 }), NOW)
      ).toEqual({
        status: 403,
        reason: 'count',
      });
      expect(
        await admitCiCreate(store(rows), OP, add({ staff: true }), NOW)
      ).toEqual({
        status: 403,
        reason: 'staff',
      });
    });

    it.each([
      ['another operator', { operatorUserId: HUMAN }],
      ['another purpose', { purpose: 'meet-load' }],
    ])('refuses a run owned by %s', async (_label, overrides) => {
      expect(
        await admitCiCreate(store([row(overrides)]), OP, add({}), NOW)
      ).toEqual({ status: 403, reason: 'run_foreign' });
    });

    it('refuses to append to a run that outlives the CI TTL', async () => {
      const rows = [row({ expiresAt: hoursAgo(-48) })];
      expect(await admitCiCreate(store(rows), OP, add({}), NOW)).toEqual({
        status: 403,
        reason: 'ttl',
      });
    });

    it('refuses an unknown run', async () => {
      expect(await admitCiCreate(store([]), OP, add({}), NOW)).toEqual({
        status: 404,
        reason: 'run_unknown',
      });
    });
  });
});

describe('admitCiTarget', () => {
  const admin = (result: unknown) => ({
    auth: { admin: { getUserById: vi.fn(async () => result) } },
  });
  const user = (marker: Record<string, unknown>) => ({
    data: {
      user: {
        id: 'u-1',
        app_metadata: {
          qa_test: true,
          qa_owner: OP,
          qa_purpose: QA_CI_PURPOSE,
          ...marker,
        },
      },
    },
    error: null,
  });

  it('admits an account this operator created for upskii-e2e', async () => {
    expect(await admitCiTarget(admin(user({})) as never, 'u-1', OP)).toBeNull();
  });

  it.each([
    ['another operator', { qa_owner: HUMAN }],
    ['another purpose', { qa_purpose: 'meet-load' }],
    ['a non-QA account', { qa_test: undefined }],
  ])('refuses an account of %s', async (_label, marker) => {
    expect(
      await admitCiTarget(admin(user(marker)) as never, 'u-1', OP)
    ).toEqual({ status: 403, reason: 'target_foreign' });
  });

  it('separates a missing account from a failed lookup', async () => {
    expect(
      await admitCiTarget(
        admin({ data: { user: null }, error: { status: 404 } }) as never,
        'u-1',
        OP
      )
    ).toMatchObject({ status: 404 });
    expect(
      await admitCiTarget(
        admin({ data: { user: null }, error: { status: 500 } }) as never,
        'u-1',
        OP
      )
    ).toMatchObject({ status: 503 });
  });
});

describe('admitCiCleanup', () => {
  it('refuses the global expired sweep', async () => {
    expect(await admitCiCleanup(store([]), OP, { expired: true })).toEqual({
      status: 403,
      reason: 'global_cleanup',
    });
  });

  it('returns the undeleted accounts of its own run', async () => {
    const live = row();
    const rows = [live, row({ state: 'deleted' })];
    expect(
      await admitCiCleanup(store(rows), OP, { runId: 'abcd1234' })
    ).toEqual({ userIds: [live.userId] });
  });

  it('refuses a run with any foreign account', async () => {
    const rows = [row(), row({ operatorUserId: HUMAN })];
    expect(
      await admitCiCleanup(store(rows), OP, { runId: 'abcd1234' })
    ).toEqual({ status: 403, reason: 'run_foreign' });
  });
});
