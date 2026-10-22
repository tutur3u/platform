import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ entered: vi.fn(), query: vi.fn() }));
vi.mock('postgres', () => ({
  default: () => {
    const transaction = async (
      parts: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      db.query(parts.join('?'), values);
    };
    return Object.assign(async () => {}, {
      begin: async (run: (sql: typeof transaction) => Promise<void>) => {
        db.entered();
        await run(transaction);
      },
    });
  },
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: () => null,
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-agent', () => ({
  extractUserAgentFromHeaders: () => null,
}));

import {
  setLogDrainUserContext,
  withCronLogDrain,
} from '../lib/infrastructure/log-drain';

beforeEach(() => {
  db.entered.mockReset();
  db.query.mockClear();
  vi.stubEnv('PLATFORM_LOG_DRAIN_ENABLED', '1');
  vi.stubEnv(
    'PLATFORM_LOG_DRAIN_DATABASE_URL',
    'postgres://fixture.invalid/not-used'
  );
});
const options = {
  jobId: 'provider-sync',
  path: '/api/cron/calendar/provider-sync',
};
describe('cron background persistence retention', () => {
  it('retains exactly one actual persistence promise and preserves response identity', async () => {
    const response = new Response('confirmed', { status: 202 });
    const retained: Promise<void>[] = [];
    const result = await withCronLogDrain(
      options,
      async () => response,
      (work) => retained.push(work)
    );
    expect(result).toBe(response);
    expect(retained).toHaveLength(1);
    await retained[0];
    expect(db.entered).toHaveBeenCalledTimes(1);
    expect(
      db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO requests'))
    ).toBe(true);
  });
  it('retains once on handler failure and does not let callback failure replace it', async () => {
    const original = new Error('provider outcome unknown');
    const retained: Promise<void>[] = [];
    const operation = withCronLogDrain(
      options,
      async () => {
        throw original;
      },
      (work) => {
        retained.push(work);
        throw new Error('retainer failed');
      }
    );
    await expect(operation).rejects.toBe(original);
    expect(retained).toHaveLength(1);
    await retained[0];
    expect(db.entered).toHaveBeenCalledTimes(1);
  });
  it('keeps concurrent actor context on each retained request record', async () => {
    const retained: Promise<void>[] = [];
    await Promise.all(
      ['one', 'two'].map((actor) =>
        withCronLogDrain(
          { ...options, jobId: actor },
          async () => {
            setLogDrainUserContext({ userId: actor });
            await Promise.resolve();
            return new Response(actor);
          },
          (work) => retained.push(work)
        )
      )
    );
    expect(retained).toHaveLength(2);
    await Promise.all(retained);
    const requests = db.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO requests')
    );
    expect(requests).toHaveLength(2);
    expect(requests.map(([, values]) => values[16]).sort()).toEqual([
      'one',
      'two',
    ]);
  });
  it('keeps the original handler error when persistence fails', async () => {
    db.entered.mockImplementationOnce(() => {
      throw new Error('sink unavailable');
    });
    const original = new Error('handler failed');
    const retained: Promise<void>[] = [];
    await expect(
      withCronLogDrain(
        options,
        async () => {
          throw original;
        },
        (work) => retained.push(work)
      )
    ).rejects.toBe(original);
    expect(retained).toHaveLength(1);
    await expect(retained[0]).resolves.toBeUndefined();
    expect(db.entered).toHaveBeenCalledTimes(1);
  });
});
