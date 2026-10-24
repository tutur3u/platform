import { vi } from 'vitest';

type LedgerArgs = {
  p_expires_at: string;
  p_nonce: string;
  p_provider: string;
  p_user_id: string;
};

/**
 * In-memory stand-in for `private.consume_calendar_oauth_state_nonce` with the
 * same contract: `true` on first use, `false` on replay. Set `failure` to
 * simulate a missing table/RPC (for example PostgREST `PGRST202`).
 */
export function createFakeCalendarOAuthNonceLedger() {
  const consumed = new Set<string>();
  const ledger = {
    calls: [] as Array<{ fn: string; args: LedgerArgs; schema: string }>,
    failure: null as { code: string; message: string } | null,
    reset() {
      consumed.clear();
      ledger.calls.length = 0;
      ledger.failure = null;
    },
    client: {
      schema: vi.fn((schema: string) => ({
        rpc: vi.fn(async (fn: string, args: LedgerArgs) => {
          ledger.calls.push({ args, fn, schema });
          if (ledger.failure) return { data: null, error: ledger.failure };
          if (consumed.has(args.p_nonce)) return { data: false, error: null };
          consumed.add(args.p_nonce);
          return { data: true, error: null };
        }),
      })),
    },
  };

  return ledger;
}

type FakeLedger = ReturnType<typeof createFakeCalendarOAuthNonceLedger>;

/**
 * Process-wide fake ledger shared by a route test and its mocked
 * `createAdminClient`, stable across `vi.resetModules()`.
 */
export function sharedFakeCalendarOAuthNonceLedger(): FakeLedger {
  const store = globalThis as typeof globalThis & {
    __calendarOAuthNonceLedger?: FakeLedger;
  };
  store.__calendarOAuthNonceLedger ??= createFakeCalendarOAuthNonceLedger();
  return store.__calendarOAuthNonceLedger;
}
