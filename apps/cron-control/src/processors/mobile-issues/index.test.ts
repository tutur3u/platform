import { expect, it, vi } from 'vite-plus/test';
import { handleControlRequest } from '../../control';
import {
  dispatchScheduledJobs,
  type DispatchEnv,
  USER_AGENT,
} from '../../dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from '../../ledger';
import { classifyMobileIssues, MOBILE_ISSUES_JOB } from './index';

const cron = '*/30 * * * *';
const at = Date.parse('2026-11-22T04:00:00Z');
const issueId = 'a'.repeat(32);
const operatorToken = 'local-test-operator-token-00000000000';
const secret = 'mobile-issue-fixture-signing-key-00000';
const env = {
  CRON_CONTROL_ENABLED_JOBS: MOBILE_ISSUES_JOB,
  CRON_CONTROL_OPERATOR_TOKEN: operatorToken,
  MOBILE_CRASHLYTICS_MODE: 'test',
  MOBILE_CRASHLYTICS_UNTIL: '2026-11-22T05:00:00Z',
  MASTERMIND_MOBILE_ALERTS_SECRET: secret,
  WEB_ORIGIN: 'https://tuturuuu.com',
};

function fixture(respond: typeof fetch) {
  const { store } = memoryLedgerStore();
  const ledger = vi.fn(() => localLedger(new LedgerCore(store)));
  const fetch = vi.fn(respond);
  const run = (now = at, config: DispatchEnv = env) =>
    dispatchScheduledJobs(cron, now, config, {
      fetch,
      ledger,
      now: () => now,
      sleep: async () => undefined,
    });
  const stop = () =>
    handleControlRequest(
      new Request(
        `https://cron.example/control/jobs/${MOBILE_ISSUES_JOB}/stop`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${operatorToken}` },
        }
      ),
      env,
      ledger
    );
  return { fetch, ledger, run, stop };
}

const issue = {
  platform: 'ios',
  issueId,
  build: 100,
  firstAt: at - 10_000,
  recent: 3,
  previous: 0,
} as const;

it('distinguishes new activity, a fixed build recurring, and a threefold velocity spike', () => {
  expect(classifyMobileIssues([issue], at, new Map())).toMatchObject([
    { kind: 'new', count: 3 },
  ]);
  const known = { ...issue, firstAt: at - 86_400_000 };
  expect(
    classifyMobileIssues([known], at, new Map([[`ios:${issueId}`, 101]]))
  ).toEqual([]);
  expect(
    classifyMobileIssues([known], at, new Map([[`ios:${issueId}`, 100]]))
  ).toMatchObject([{ kind: 'regression', fixBuild: 100 }]);
  expect(
    classifyMobileIssues(
      [{ ...known, recent: 10, previous: 17 }],
      at,
      new Map()
    )
  ).toEqual([]);
  expect(
    classifyMobileIssues(
      [{ ...known, recent: 10, previous: 16 }],
      at,
      new Map()
    )
  ).toMatchObject([{ kind: 'spike', count: 10 }]);
});

it('does no external or ledger work with missing, expired, or overlong active approval', async () => {
  const h = fixture(async () => {
    throw new Error('unexpected effect');
  });
  for (const until of [
    undefined,
    '2026-11-22T04:00:00Z',
    '2026-12-01T00:00:00Z',
  ]) {
    expect(
      await h.run(at, {
        ...env,
        MOBILE_CRASHLYTICS_MODE: 'active',
        MOBILE_CRASHLYTICS_UNTIL: until,
      })
    ).toMatchObject([{ outcome: 'skipped', reason: 'mobile-crashlytics-off' }]);
  }
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.ledger).not.toHaveBeenCalled();
});

it('sends exactly one signed synthetic alert across duplicate ticks and ledger restarts', async () => {
  const h = fixture(async (url, init) => {
    const path = '/api/v1/mastermind/fleet/alerts';
    expect(String(url)).toBe(`https://tuturuuu.com${path}`);
    expect(init?.method).toBe('PUT');
    expect(init?.redirect).toBe('manual');
    const body = String(init?.body);
    expect(JSON.parse(body)).toEqual({
      slot: new Date(at).toISOString(),
      alerts: [
        {
          kind: 'test',
          platform: 'ios',
          issueId: '0'.repeat(32),
          count: 1,
          build: 1,
        },
      ],
    });
    const header = new Headers(init?.headers);
    expect(header.get('user-agent')).toBe(USER_AGENT);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signature = Uint8Array.from(
      header.get('x-mm-signature')!.match(/../gu)!,
      (byte) => Number.parseInt(byte, 16)
    );
    expect(
      await crypto.subtle.verify(
        'HMAC',
        key,
        signature,
        new TextEncoder().encode(`${at / 1000}.PUT ${path}\n${body}`)
      )
    ).toBe(true);
    return new Response(null, { status: 204 });
  });
  expect(await h.run()).toMatchObject([
    { outcome: 'ok', detail: { candidates: 1 } },
  ]);
  expect(await h.run()).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(await h.run(at + 30 * 60_000)).toMatchObject([
    { outcome: 'ok', detail: { testAlreadySent: 1 } },
  ]);
  expect(h.fetch).toHaveBeenCalledTimes(1);
});

it('fails a redirected publish without following it or recording a synthetic receipt', async () => {
  const h = fixture(async (_url, init) => {
    expect(init?.redirect).toBe('manual');
    return new Response(null, {
      status: 307,
      headers: { location: 'https://redirect.example.invalid/' },
    });
  });
  expect(await h.run()).toMatchObject([
    { attempts: 1, outcome: 'failed', detail: { publish: 1 } },
  ]);
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect(await h.run(at + 30 * 60_000)).toMatchObject([
    { attempts: 1, outcome: 'failed', detail: { publish: 1 } },
  ]);
  expect(h.fetch).toHaveBeenCalledTimes(2);
});

it('fences a durable stop during the OAuth call and does not retry a query', async () => {
  const key = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const pem = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.exportKey('pkcs8', key.privateKey))
    )
  );
  const active = {
    ...env,
    MOBILE_CRASHLYTICS_MODE: 'active',
    MOBILE_CRASHLYTICS_UNTIL: '2026-11-23T00:00:00Z',
    MOBILE_CRASHLYTICS_FIX_BUILDS: JSON.stringify({ [`ios:${issueId}`]: 100 }),
    MOBILE_CRASHLYTICS_BIGQUERY: JSON.stringify({
      client_email: 'reader@test-project.iam.gserviceaccount.com',
      private_key: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`,
      project_id: 'test-project',
      location: 'US',
      ios_table: 'test-project.crash.ios_REALTIME',
      android_table: 'test-project.crash.android_REALTIME',
    }),
  };
  const failed = fixture(async (url, init) => {
    expect(init?.redirect).toBe('manual');
    if (String(url) === 'https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'fake.access-token' });
    expect(String(url)).toBe(
      'https://bigquery.googleapis.com/bigquery/v2/projects/test-project/queries'
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      maximumBytesBilled: '67108864',
      maxResults: 100,
      jobTimeoutMs: '10000',
      queryParameters: [
        { name: 'slot', parameterValue: { value: '2026-11-22T03:55:00.000Z' } },
        {
          name: 'fixed_builds',
          parameterValue: {
            arrayValues: [
              {
                structValues: {
                  issue_key: { value: `ios:${issueId}` },
                  build: { value: '100' },
                },
              },
            ],
          },
        },
      ],
    });
    return Response.json({ jobComplete: false }, { status: 200 });
  });
  expect(await failed.run(at, active)).toMatchObject([
    { attempts: 1, outcome: 'failed' },
  ]);
  expect(await failed.run(at, active)).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(failed.fetch).toHaveBeenCalledTimes(2);

  for (const redirectedCall of [1, 2]) {
    let calls = 0;
    const redirected = fixture(async (_url, init) => {
      expect(init?.redirect).toBe('manual');
      if (++calls === redirectedCall) {
        return new Response(null, {
          status: 307,
          headers: { location: 'https://redirect.example.invalid/' },
        });
      }
      return Response.json({ access_token: 'fake.access-token' });
    });
    expect(await redirected.run(at, active)).toMatchObject([
      { attempts: 1, outcome: 'failed', detail: { collection: 1 } },
    ]);
    expect(redirected.fetch).toHaveBeenCalledTimes(redirectedCall);
  }

  const fenced = fixture(async (url) => {
    expect(String(url)).toBe('https://oauth2.googleapis.com/token');
    expect((await fenced.stop())?.ok).toBe(true);
    return Response.json({ access_token: 'fake.access-token' });
  });
  expect(await fenced.run(at, active)).toMatchObject([
    { attempts: 1, outcome: 'stopped' },
  ]);
  expect(await fenced.run(at + 30 * 60_000, active)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(fenced.fetch).toHaveBeenCalledTimes(1);

  const beforePublish = fixture(async (url) => {
    if (String(url) === 'https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'fake.access-token' });
    expect(String(url)).toBe(
      'https://bigquery.googleapis.com/bigquery/v2/projects/test-project/queries'
    );
    expect((await beforePublish.stop())?.ok).toBe(true);
    return Response.json({
      jobComplete: true,
      totalRows: '1',
      rows: [
        {
          f: ['ios', issueId, '100', String(at - 10 * 60_000), '12', '0'].map(
            (v) => ({ v })
          ),
        },
      ],
    });
  });
  expect(await beforePublish.run(at, active)).toMatchObject([
    { attempts: 1, outcome: 'stopped' },
  ]);
  expect(beforePublish.fetch).toHaveBeenCalledTimes(2);

  const crowded = fixture(async (url, init) => {
    if (String(url) === 'https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'fake.access-token' });
    if (String(url).startsWith('https://bigquery.googleapis.com/'))
      return Response.json({
        jobComplete: true,
        totalRows: '21',
        rows: Array.from({ length: 21 }, (_, i) => ({
          f: [
            'android',
            i.toString(16).padStart(32, '0'),
            '101',
            String(at - 10 * 60_000),
            String(i === 20 ? 25 : 1),
            '0',
          ].map((v) => ({ v })),
        })),
      });
    expect(String(url)).toBe(
      'https://tuturuuu.com/api/v1/mastermind/fleet/alerts'
    );
    const { alerts } = JSON.parse(String(init?.body));
    expect(alerts).toHaveLength(20);
    expect(alerts[0]).toMatchObject({ kind: 'spike', count: 25 });
    return new Response(null, { status: 204 });
  });
  expect(await crowded.run(at, active)).toMatchObject([
    { attempts: 1, outcome: 'ok', detail: { candidates: 22, clipped: 1 } },
  ]);
  expect(crowded.fetch).toHaveBeenCalledTimes(3);
});
