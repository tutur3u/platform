// Forms upload cleanup through dispatch, the ledger fence and the processor.
// The SQL claim and storage write fence are covered by the Forms migrations'
// pgTAP suites; these cases count every request a slot makes.
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { findJob } from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import {
  FORMS_UPLOAD_BUCKET,
  FORMS_UPLOAD_CLAIM_LIMIT,
  FORMS_UPLOAD_CLAIM_RPC,
  FORMS_UPLOAD_MAX_PAGES,
} from './processors/forms-upload-cleanup';

const ID = 'forms-upload-cleanup';
const CRON = '*/30 * * * *';
const T0 = Date.parse('2026-11-23T10:30:00Z');
const DB = 'https://database.example.test';
const env = {
  CRON_CONTROL_ENABLED_JOBS: ID,
  FORMS_UPLOAD_CLEANUP_MODE: 'delete',
  SUPABASE_URL: DB,
  SUPABASE_SECRET_KEY: 'sb_secret_disposable',
};

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function rows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    id: uuid(offset + index + 1),
    ws_id: uuid(900),
    version_id: uuid(901),
    launch_id: uuid(902),
    question_id: uuid(903),
    cleanup_attempts: 1,
  }));
}

type Reply = (url: URL, init?: RequestInit) => Response;
const ok = () => new Response(null, { status: 200 });

function harness(replies: Reply[]) {
  const { store } = memoryLedgerStore();
  let core = new LedgerCore(store);
  let call = 0;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const reply = replies[Math.min(call, replies.length - 1)];
    call += 1;
    return reply(new URL(String(input)), init);
  });
  const run = (slot = 0, configured: Record<string, string> = env) =>
    dispatchScheduledJobs(CRON, T0 + slot * 1_800_000, configured, {
      fetch: fetchMock,
      ledger: () => localLedger(core),
      now: () => T0 + slot * 1_800_000,
      sleep: async () => {
        throw new Error('Cleanup must not retry within a slot');
      },
    });
  return {
    fetchMock,
    run,
    restart: () => {
      core = new LedgerCore(store);
    },
    core: () => core,
    requests: () =>
      fetchMock.mock.calls.map(([url, init]) => {
        const parsed = new URL(String(url));
        return `${init?.method} ${parsed.pathname}`;
      }),
  };
}

afterEach(() => vi.restoreAllMocks());

it('is a registered claim-fenced job on an existing trigger', () => {
  expect(findJob(ID)).toMatchObject({
    cron: CRON,
    overlap: 'claim-fenced',
    path: `/rest/v1/rpc/${FORMS_UPLOAD_CLAIM_RPC}`,
    workerProcessor: ID,
  });
});

it('defaults off with no requests when the job is not enabled', async () => {
  const h = harness([() => Response.json([])]);
  expect(await h.run(0, { ...env, CRON_CONTROL_ENABLED_JOBS: '' })).toEqual([]);
  expect(h.fetchMock).not.toHaveBeenCalled();
});

it.each([undefined, 'off', 'Delete', ' delete'])(
  'makes no request while the mode is %j',
  async (mode) => {
    const h = harness([() => Response.json([])]);
    const configured: Record<string, string> = { ...env };
    if (mode === undefined) delete configured.FORMS_UPLOAD_CLEANUP_MODE;
    else configured.FORMS_UPLOAD_CLEANUP_MODE = mode;
    expect(await h.run(0, configured)).toMatchObject([
      { id: ID, outcome: 'ok', detail: { off: 1 } },
    ]);
    expect(h.fetchMock).not.toHaveBeenCalled();
  }
);

it('makes one claim when nothing has expired', async () => {
  const h = harness([() => Response.json([])]);
  expect(await h.run()).toMatchObject([
    { outcome: 'ok', detail: { claimed: 0, removed: 0, pages: 0 } },
  ]);
  expect(h.requests()).toEqual([`POST /rest/v1/rpc/${FORMS_UPLOAD_CLAIM_RPC}`]);
});

it('claims, deletes the objects, then forgets the reservations', async () => {
  const claimed = rows(3);
  const h = harness([() => Response.json(claimed), ok, ok]);
  expect(await h.run()).toMatchObject([
    { outcome: 'ok', detail: { claimed: 3, removed: 3, pages: 1 } },
  ]);
  expect(h.requests()).toEqual([
    `POST /rest/v1/rpc/${FORMS_UPLOAD_CLAIM_RPC}`,
    `DELETE /storage/v1/object/${FORMS_UPLOAD_BUCKET}`,
    'DELETE /rest/v1/form_respondent_uploads',
  ]);
  const [[, claim], [, storage], [forgetUrl, forget]] = h.fetchMock.mock.calls;
  expect(claim?.body).toBe(
    JSON.stringify({ p_form_id: null, p_actor_scope: null })
  );
  expect(JSON.parse(String(storage?.body))).toEqual({
    prefixes: claimed.map(
      (row) =>
        `${row.ws_id}/${row.version_id}/${row.launch_id}/${row.question_id}/${row.id}`
    ),
  });
  const storageHeaders = new Headers(storage?.headers);
  expect(storageHeaders.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
  expect(storageHeaders.has('Authorization')).toBe(false);
  expect(Object.fromEntries(new URL(String(forgetUrl)).searchParams)).toEqual({
    id: `in.(${claimed.map(({ id }) => id).join(',')})`,
    cleanup_started_at: 'not.is.null',
    ready_at: 'is.null',
    claimed_response_id: 'is.null',
  });
  expect(new Headers(forget?.headers).get('Content-Profile')).toBe('private');
  for (const [, init] of h.fetchMock.mock.calls)
    expect(init?.redirect).toBe('manual');
});

it('sends a legacy JWT service key as the storage bearer token too', async () => {
  const h = harness([() => Response.json(rows(1)), ok, ok]);
  await h.run(0, { ...env, SUPABASE_SECRET_KEY: 'eyJ.fixture.jwt' });
  expect(
    new Headers(h.fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')
  ).toBe('Bearer eyJ.fixture.jwt');
});

it('bounds a slot to four full pages', async () => {
  let page = 0;
  const h = harness([
    (url) => {
      if (url.pathname.includes('/rpc/')) {
        page += 1;
        return Response.json(
          rows(FORMS_UPLOAD_CLAIM_LIMIT, page * FORMS_UPLOAD_CLAIM_LIMIT)
        );
      }
      return ok();
    },
  ]);
  expect(await h.run()).toMatchObject([
    {
      outcome: 'degraded',
      detail: {
        capped: 1,
        pages: FORMS_UPLOAD_MAX_PAGES,
        claimed: FORMS_UPLOAD_MAX_PAGES * FORMS_UPLOAD_CLAIM_LIMIT,
        removed: FORMS_UPLOAD_MAX_PAGES * FORMS_UPLOAD_CLAIM_LIMIT,
      },
    },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(FORMS_UPLOAD_MAX_PAGES * 3);
});

it('stops a full page loop at the first short page', async () => {
  const h = harness([
    () => Response.json(rows(FORMS_UPLOAD_CLAIM_LIMIT)),
    ok,
    ok,
    () => Response.json(rows(2, 50)),
    ok,
    ok,
  ]);
  expect(await h.run()).toMatchObject([
    { outcome: 'ok', detail: { pages: 2, claimed: 22, removed: 22 } },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(6);
});

it('honors a durable stop between the claim and the delete', async () => {
  const h = harness([
    () => {
      h.core().stop(ID, 'operator');
      return Response.json(rows(2));
    },
  ]);
  expect(await h.run()).toMatchObject([
    { outcome: 'stopped', detail: { claimed: 2, removed: 0 } },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});

it('stays stopped across a restart and resumes only for a new slot', async () => {
  const h = harness([() => Response.json([])]);
  await h.run();
  h.core().stop(ID, 'operator');
  h.restart();
  expect(await h.run(1)).toMatchObject([
    { outcome: 'skipped', reason: 'stopped' },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
  h.core().resume(ID);
  expect(await h.run(2)).toMatchObject([{ outcome: 'ok' }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps the reservations when the storage delete is refused', async () => {
  const h = harness([
    () => Response.json(rows(2)),
    () => new Response(null, { status: 500 }),
  ]);
  expect(await h.run()).toMatchObject([
    { outcome: 'failed', attempts: 1, detail: { claimed: 2, removed: 0 } },
  ]);
  expect(h.requests()).toEqual([
    `POST /rest/v1/rpc/${FORMS_UPLOAD_CLAIM_RPC}`,
    `DELETE /storage/v1/object/${FORMS_UPLOAD_BUCKET}`,
  ]);
});

it('honors a durable stop between the delete and the forget', async () => {
  const h = harness([
    () => Response.json(rows(2)),
    () => {
      h.core().stop(ID, 'operator');
      return ok();
    },
  ]);
  expect(await h.run()).toMatchObject([
    { outcome: 'stopped', detail: { claimed: 2, removed: 0 } },
  ]);
  expect(h.requests()).toEqual([
    `POST /rest/v1/rpc/${FORMS_UPLOAD_CLAIM_RPC}`,
    `DELETE /storage/v1/object/${FORMS_UPLOAD_BUCKET}`,
  ]);
});

it('keeps the reservations when forgetting them is refused', async () => {
  const h = harness([
    () => Response.json(rows(2)),
    ok,
    () => new Response(null, { status: 500 }),
  ]);
  expect(await h.run()).toMatchObject([
    { outcome: 'failed', attempts: 1, detail: { claimed: 2, removed: 0 } },
  ]);
  expect(h.requests()).toEqual([
    `POST /rest/v1/rpc/${FORMS_UPLOAD_CLAIM_RPC}`,
    `DELETE /storage/v1/object/${FORMS_UPLOAD_BUCKET}`,
    'DELETE /rest/v1/form_respondent_uploads',
  ]);
});

it.each([
  ['the storage delete', 2],
  ['the forget', 3],
])('treats a timeout during %s as an unknown outcome', async (_, calls) => {
  const timeout = () => {
    throw new DOMException('The operation timed out.', 'TimeoutError');
  };
  const h = harness(
    calls === 2
      ? [() => Response.json(rows(2)), timeout]
      : [() => Response.json(rows(2)), ok, timeout]
  );
  expect(await h.run()).toMatchObject([
    { outcome: 'unknown', detail: { claimed: 2, removed: 0 } },
  ]);
  expect(h.fetchMock).toHaveBeenCalledTimes(calls);
});

it.each([
  ['an unknown row shape', [{ id: 'not-a-uuid' }]],
  ['an oversized page', rows(FORMS_UPLOAD_CLAIM_LIMIT + 1)],
  ['a non-array body', { rows: [] }],
])('treats %s as an unknown outcome without deleting', async (_, body) => {
  const h = harness([() => Response.json(body)]);
  expect(await h.run()).toMatchObject([{ outcome: 'unknown' }]);
  expect(h.fetchMock).toHaveBeenCalledTimes(1);
});
