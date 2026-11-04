import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POLICY_CHANGE_NOTICE,
  policyNoticeConfirmToken,
  policyNoticeRecipientHash,
  policyNoticeVersion,
} from './definition';
import { parsePreviewAddresses, runPolicyNotice } from './sender';
import type {
  MailerOutcome,
  PolicyNoticeMailer,
  PolicyNoticeStore,
  Recipient,
  Suppression,
} from './types';

const NOTICE = POLICY_CHANGE_NOTICE;
const VERSION = policyNoticeVersion(NOTICE);
const ACTOR = 'actor-id';
const LIVE = policyNoticeConfirmToken('live', VERSION);
const TEST = policyNoticeConfirmToken('test_list', VERSION);
// Server-configured preview addresses (POLICY_NOTICE_PREVIEW_ADDRESSES).
const PREVIEW = [
  'owner@example.com',
  'o@example.com',
  'unsub@example.com',
  'fine@example.com',
];

type Row = {
  mode: 'test_list' | 'live';
  runId: string;
  status: 'pending' | 'sent' | 'failed' | 'suppressed' | 'unknown';
  suppression?: Suppression;
};

// In-memory stand-in for the private.policy_notice_* functions, with the same
// gate and claim rules (the SQL itself is covered by the PGlite suite).
class FakeStore implements PolicyNoticeStore {
  runs = new Map<string, { mode: string; status: string; version: string }>();
  ledger = new Map<string, Row>();
  suppressions = new Map<string, Suppression>();
  health_ = {
    attempted: 0,
    rejected: 0,
    unknown: 0,
    hardBounces: 0,
    complaints: 0,
  };
  calls: string[] = [];

  constructor(public audience: string[] = []) {}

  private key(version: string, hash: string) {
    return `${version}:${hash}`;
  }

  private row(email: string): Recipient {
    return {
      recipientHash: policyNoticeRecipientHash(email),
      email: email.trim().toLowerCase(),
      suppression: this.suppressions.get(email.trim().toLowerCase()) ?? null,
    };
  }

  async counts() {
    this.calls.push('counts');
    return {
      eligible: 3,
      suppressed: 1,
      alreadySent: 0,
      previouslyFailed: 0,
      excludedPersonalOnly: 9,
    };
  }

  async startRun(input: { version: string; mode: string }) {
    this.calls.push(`start:${input.mode}`);
    const has = (mode: string, status: string) =>
      [...this.runs.values()].some(
        (r) =>
          r.mode === mode && r.status === status && r.version === input.version
      );
    if (input.mode !== 'dry_run' && !has('dry_run', 'completed'))
      throw new Error('policy_notice_gate:dry_run_required');
    if (
      input.mode === 'live' &&
      ![...this.ledger.entries()].some(
        ([k, r]) =>
          k.startsWith(`${input.version}:`) &&
          r.mode === 'test_list' &&
          r.status === 'sent'
      )
    )
      throw new Error('policy_notice_gate:test_send_required');
    const id = `run-${this.runs.size + 1}`;
    this.runs.set(id, {
      mode: input.mode,
      status: 'running',
      version: input.version,
    });
    return id;
  }

  async finishRun(runId: string, status: string) {
    const run = this.runs.get(runId);
    if (run?.status === 'running') run.status = status;
  }

  async nextRecipients(input: { version: string; limit: number }) {
    this.calls.push('next');
    return this.audience
      .map((email) => this.row(email))
      .filter((r) => !this.ledger.has(this.key(input.version, r.recipientHash)))
      .sort((a, b) => a.recipientHash.localeCompare(b.recipientHash))
      .slice(0, input.limit);
  }

  async classify(emails: string[]) {
    this.calls.push('classify');
    return [...new Set(emails.map((e) => e.trim().toLowerCase()))].map((e) =>
      this.row(e)
    );
  }

  async claim(runId: string, hash: string, suppression: Suppression | null) {
    const run = this.runs.get(runId);
    if (run?.status !== 'running' || run.mode === 'dry_run')
      throw new Error('policy_notice_gate:run_not_open');
    const key = this.key(run.version, hash);
    if (this.ledger.has(key)) return false;
    this.ledger.set(key, {
      mode: run.mode as Row['mode'],
      runId,
      status: suppression ? 'suppressed' : 'pending',
      suppression: suppression ?? undefined,
    });
    return true;
  }

  async record(
    runId: string,
    hash: string,
    outcome: Parameters<PolicyNoticeStore['record']>[2]
  ) {
    const run = this.runs.get(runId);
    const row = run && this.ledger.get(this.key(run.version, hash));
    if (!row || row.runId !== runId || row.status !== 'pending') return false;
    row.status = outcome.status;
    if (outcome.status === 'suppressed') row.suppression = outcome.suppression;
    return true;
  }

  async health() {
    this.calls.push('health');
    return this.health_;
  }

  statusOf(email: string) {
    return this.ledger.get(this.key(VERSION, policyNoticeRecipientHash(email)))
      ?.status;
  }
}

class FakeMailer implements PolicyNoticeMailer {
  sent: Array<{ to: string }> = [];
  constructor(
    private outcome: (to: string) => MailerOutcome = () => ({
      kind: 'sent',
      messageId: 'ses-id',
    })
  ) {}
  async send(input: Parameters<PolicyNoticeMailer['send']>[0]) {
    this.sent.push({ to: input.to });
    expect(input).not.toHaveProperty('bypassUnsubscribe');
    expect(input.replyTo).toEqual(['legal@tuturuuu.com']);
    expect(input.subject).toBe(NOTICE.subject);
    expect(input.html).toBe(NOTICE.html);
    expect(input.text).toBe(NOTICE.text);
    return this.outcome(input.to);
  }
}

function clock(start = 0) {
  let now = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
  };
}

async function openGate(store: FakeStore, mailer = new FakeMailer()) {
  const deps = {
    store,
    mailer,
    clock: clock(),
    notice: NOTICE,
    previewAddresses: PREVIEW,
  };
  await runPolicyNotice({}, ACTOR, deps);
  await runPolicyNotice(
    {
      mode: 'test_list',
      confirm: TEST,
      testRecipients: ['owner@example.com'],
    },
    ACTOR,
    deps
  );
}

const audience = (n: number) =>
  Array.from({ length: n }, (_, i) => `person${i}@example.com`);

let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(JSON.stringify(args));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe('runPolicyNotice', () => {
  it('defaults to a dry run that returns counts only and sends nothing', async () => {
    const store = new FakeStore(audience(4));
    const mailer = new FakeMailer();

    const result = await runPolicyNotice({}, ACTOR, {
      store,
      mailer,
      clock: clock(),
      notice: NOTICE,
      previewAddresses: PREVIEW,
    });

    expect(result).toEqual({
      mode: 'dry_run',
      noticeId: NOTICE.id,
      noticeVersion: VERSION,
      counts: {
        eligible: 3,
        suppressed: 1,
        alreadySent: 0,
        previouslyFailed: 0,
        excludedPersonalOnly: 9,
      },
    });
    expect(mailer.sent).toHaveLength(0);
    expect(store.calls).toEqual(['counts', 'start:dry_run']);
    expect(JSON.stringify(result) + logs.join('')).not.toContain('@');
  });

  it.each([
    ['test_list', undefined],
    ['test_list', 'send-test:v3-wrong'],
    ['test_list', LIVE],
    ['live', undefined],
    ['live', TEST],
  ] as const)(
    'refuses a %s send without its exact confirm token (%s)',
    async (mode, confirm) => {
      const store = new FakeStore(audience(2));
      const mailer = new FakeMailer();
      await expect(
        runPolicyNotice(
          {
            mode,
            confirm,
            testRecipients:
              mode === 'test_list' ? ['owner@example.com'] : undefined,
          },
          ACTOR,
          {
            store,
            mailer,
            clock: clock(),
            notice: NOTICE,
            previewAddresses: PREVIEW,
          }
        )
      ).rejects.toMatchObject({ code: 'confirm_required' });
      expect(store.calls).toEqual([]);
      expect(mailer.sent).toHaveLength(0);
    }
  );

  it('refuses every real send until the ledger has a dry run and a test-list send', async () => {
    const store = new FakeStore(audience(2));
    const mailer = new FakeMailer();
    const deps = {
      store,
      mailer,
      clock: clock(),
      notice: NOTICE,
      previewAddresses: PREVIEW,
    };

    await expect(
      runPolicyNotice(
        { mode: 'test_list', confirm: TEST, testRecipients: ['o@example.com'] },
        ACTOR,
        deps
      )
    ).rejects.toMatchObject({ code: 'dry_run_required' });
    await runPolicyNotice({ mode: 'dry_run' }, ACTOR, deps);
    await expect(
      runPolicyNotice({ mode: 'live', confirm: LIVE }, ACTOR, deps)
    ).rejects.toMatchObject({ code: 'test_send_required' });
    expect(mailer.sent).toHaveLength(0);
  });

  it('test-list mode sends only to the allowlist, once per address', async () => {
    const store = new FakeStore(audience(3));
    const mailer = new FakeMailer();
    const deps = {
      store,
      mailer,
      clock: clock(),
      notice: NOTICE,
      previewAddresses: PREVIEW,
    };
    await runPolicyNotice({}, ACTOR, deps);

    const request = {
      mode: 'test_list' as const,
      confirm: TEST,
      testRecipients: ['Owner@Example.com', 'owner@example.com '],
    };
    const first = await runPolicyNotice(request, ACTOR, deps);
    const again = await runPolicyNotice(request, ACTOR, deps);

    expect(mailer.sent.map((s) => s.to)).toEqual(['owner@example.com']);
    expect(store.calls).not.toContain('next');
    expect(first).toMatchObject({ status: 'completed', counts: { sent: 1 } });
    expect(again).toMatchObject({ counts: { sent: 0, skipped: 1 } });
    expect(JSON.stringify([first, again]) + logs.join('')).not.toContain('@');
  });

  it('caps the test list at five addresses', async () => {
    const store = new FakeStore();
    await expect(
      runPolicyNotice(
        { mode: 'test_list', confirm: TEST, testRecipients: audience(6) },
        ACTOR,
        {
          store,
          mailer: new FakeMailer(),
          clock: clock(),
          notice: NOTICE,
          previewAddresses: PREVIEW,
        }
      )
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('honours every suppression, unsubscribes included, in every mode', async () => {
    const store = new FakeStore([
      'bounced@example.com',
      'complained@example.com',
      'blocked@example.com',
      'unsub@example.com',
      'fine@example.com',
    ]);
    store.suppressions.set('bounced@example.com', 'hard_bounce');
    store.suppressions.set('complained@example.com', 'complaint');
    store.suppressions.set('blocked@example.com', 'blocked');
    store.suppressions.set('unsub@example.com', 'unsubscribed');
    const mailer = new FakeMailer();
    const deps = {
      store,
      mailer,
      clock: clock(),
      notice: NOTICE,
      previewAddresses: PREVIEW,
    };
    await runPolicyNotice({}, ACTOR, deps);
    const preview = await runPolicyNotice(
      {
        mode: 'test_list',
        confirm: TEST,
        testRecipients: ['unsub@example.com', 'fine@example.com'],
      },
      ACTOR,
      deps
    );
    const live = await runPolicyNotice(
      { mode: 'live', confirm: LIVE },
      ACTOR,
      deps
    );

    expect(mailer.sent.map((s) => s.to)).toEqual(['fine@example.com']);
    expect(preview).toMatchObject({ counts: { sent: 1, suppressed: 1 } });
    expect(live).toMatchObject({
      status: 'completed',
      done: true,
      counts: { sent: 0, suppressed: 3 },
    });
    expect(store.statusOf('unsub@example.com')).toBe('suppressed');
  });

  it('resumes across invocations without sending any address twice', async () => {
    const store = new FakeStore(audience(7));
    const mailer = new FakeMailer();
    await openGate(store, mailer);
    const deps = {
      store,
      mailer,
      clock: clock(),
      notice: NOTICE,
      previewAddresses: PREVIEW,
    };
    const request = {
      mode: 'live' as const,
      confirm: LIVE,
      limits: { maxSendsPerInvocation: 3, batchSize: 2 },
    };

    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(await runPolicyNotice(request, ACTOR, deps));

    const live = mailer.sent.slice(1).map((s) => s.to);
    expect(live).toHaveLength(7);
    expect(new Set(live).size).toBe(7);
    expect(results.map((r) => 'done' in r && r.done)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(results[3]).toMatchObject({ counts: { sent: 0 } });
  });

  it('never retries an unknown or crashed outcome', async () => {
    const store = new FakeStore(['a@example.com', 'b@example.com']);
    const mailer = new FakeMailer((to) => {
      if (to === 'a@example.com') throw new Error('socket hang up');
      return { kind: 'unknown' };
    });
    await openGate(store, new FakeMailer());
    const deps = {
      store,
      mailer,
      clock: clock(),
      notice: NOTICE,
      previewAddresses: PREVIEW,
    };

    const first = await runPolicyNotice(
      { mode: 'live', confirm: LIVE, limits: { maxUnknownRate: 0.05 } },
      ACTOR,
      deps
    );
    await runPolicyNotice({ mode: 'live', confirm: LIVE }, ACTOR, deps);

    expect(mailer.sent.map((s) => s.to).sort()).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    expect(first).toMatchObject({ counts: { unknown: 2 } });
    expect(store.statusOf('a@example.com')).toBe('unknown');
  });

  it('records provider rejections and send-time blocks', async () => {
    const store = new FakeStore([
      'rejected@example.com',
      'blocked@example.com',
    ]);
    const mailer = new FakeMailer((to) =>
      to.startsWith('rejected') ? { kind: 'rejected' } : { kind: 'blocked' }
    );
    await openGate(store);
    await runPolicyNotice({ mode: 'live', confirm: LIVE }, ACTOR, {
      store,
      mailer,
      clock: clock(),
      notice: NOTICE,
      previewAddresses: PREVIEW,
    });
    expect(store.statusOf('rejected@example.com')).toBe('failed');
    expect(store.statusOf('blocked@example.com')).toBe('suppressed');
  });

  it.each([
    [{ complaints: 1 }, 'complaint_rate'],
    [{ rejected: 2, hardBounces: 1 }, 'bounce_rate'],
    [{ unknown: 3 }, 'unknown_rate'],
  ])('stops the run when the breaker trips (%o)', async (health, reason) => {
    const store = new FakeStore(audience(5));
    const mailer = new FakeMailer();
    await openGate(store, mailer);
    Object.assign(store.health_, { attempted: 100 }, health);

    const result = await runPolicyNotice(
      { mode: 'live', confirm: LIVE },
      ACTOR,
      {
        store,
        mailer,
        clock: clock(),
        notice: NOTICE,
        previewAddresses: PREVIEW,
      }
    );

    expect(result).toMatchObject({
      status: 'stopped',
      stopReason: reason,
      done: false,
    });
    expect(mailer.sent).toHaveLength(1);
    expect(store.calls).not.toContain('next');
  });

  it('paces sends to the configured rate and stops at the time budget', async () => {
    const store = new FakeStore(audience(10));
    const mailer = new FakeMailer();
    await openGate(store, mailer);
    const time = clock();

    const result = await runPolicyNotice(
      {
        mode: 'live',
        confirm: LIVE,
        limits: { sendsPerSecond: 2, timeBudgetMs: 5_000 },
      },
      ACTOR,
      { store, mailer, clock: time, notice: NOTICE, previewAddresses: PREVIEW }
    );

    expect(time.sleeps.every((ms) => ms === 500)).toBe(true);
    expect(mailer.sent.length - 1).toBe(10);
    expect(result).toMatchObject({ status: 'completed', done: true });

    const slow = new FakeStore(audience(10));
    const slowMailer = new FakeMailer();
    await openGate(slow, slowMailer);
    const paused = await runPolicyNotice(
      {
        mode: 'live',
        confirm: LIVE,
        limits: { sendsPerSecond: 0.5, timeBudgetMs: 5_000 },
      },
      ACTOR,
      {
        store: slow,
        mailer: slowMailer,
        clock: clock(),
        notice: NOTICE,
        previewAddresses: PREVIEW,
      }
    );
    expect(paused).toMatchObject({ status: 'paused', done: false });
    expect(slowMailer.sent.length - 1).toBe(3);
  });
});

describe('test-list allowlist', () => {
  const deps = (previewAddresses: string[]) => {
    const store = new FakeStore();
    const mailer = new FakeMailer();
    return {
      store,
      mailer,
      deps: { store, mailer, clock: clock(), notice: NOTICE, previewAddresses },
    };
  };

  it.each([
    ['someone@gmail.com'],
    ['staff@xwf.tuturuuu.com'],
    ['staff@tuturuuu.com.evil.example'],
    ['tuturuuu.com@evil.example'],
  ])('refuses %s before any ledger or send work', async (address) => {
    const { store, mailer, deps: d } = deps(['phucvo0708@gmail.com']);
    await expect(
      runPolicyNotice(
        {
          mode: 'test_list',
          confirm: TEST,
          testRecipients: ['staff@tuturuuu.com', address],
        },
        ACTOR,
        d
      )
    ).rejects.toMatchObject({ code: 'recipient_not_allowed' });
    expect(store.calls).toEqual([]);
    expect(mailer.sent).toHaveLength(0);
  });

  it('allows @tuturuuu.com staff and the configured preview addresses', async () => {
    const { mailer, deps: d } = deps(['phucvo0708@gmail.com']);
    await runPolicyNotice({}, ACTOR, d);
    await runPolicyNotice(
      {
        mode: 'test_list',
        confirm: TEST,
        testRecipients: ['Staff@Tuturuuu.com', 'PhucVo0708@gmail.com'],
      },
      ACTOR,
      d
    );
    expect(mailer.sent.map((m) => m.to).sort()).toEqual([
      'phucvo0708@gmail.com',
      'staff@tuturuuu.com',
    ]);
  });

  it('never takes preview addresses from the request', async () => {
    const { mailer, deps: d } = deps([]);
    await expect(
      runPolicyNotice(
        {
          mode: 'test_list',
          confirm: TEST,
          testRecipients: ['someone@gmail.com'],
          previewAddresses: ['someone@gmail.com'],
        },
        ACTOR,
        d
      )
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(mailer.sent).toHaveLength(0);
  });

  it('parses the configured preview list strictly', () => {
    expect(
      parsePreviewAddresses(' PhucVo0708@gmail.com, not-an-address,,b@x.io ')
    ).toEqual(['phucvo0708@gmail.com', 'b@x.io']);
    expect(parsePreviewAddresses(undefined)).toEqual([]);
  });
});
