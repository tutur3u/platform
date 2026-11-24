/**
 * The database-backed transaction confirmation. One call to
 * `public.sso_signer_confirm_transaction`, made as the Worker-only role
 * `sso_signer`, returns the bound fields of an approved, consumed,
 * not-yet-signed transaction, or NULL. The Worker overlays those fields on
 * the request, canonicalizes the result with `@tuturuuu/sso/signer-permit`
 * and signs only when it hashes to the permit's `fields` and equals the
 * request exactly.
 *
 * One attempt, bounded by `CONFIRMATION_TIMEOUT_MS`, and no retry: a timeout
 * or any error refuses with `confirmation_unavailable`, and NULL or any
 * mismatch refuses with `transaction_unconfirmed`.
 */
import { samlIdSchema } from '@tuturuuu/sso';
import { canonicalJson, fieldsHash } from '@tuturuuu/sso/signer-permit';
import { z } from 'zod';
import type { SignInput } from './input';
import { kidSchema } from './input';
import type {
  ConfirmationResult,
  TransactionConfirmation,
} from './transaction-confirmation';

export const CONFIRMATION_TIMEOUT_MS = 2_000;

export type ConfirmArgs = Readonly<{
  transactionId: string;
  clientId: string;
  kid: string;
}>;

/**
 * Runs the confirmation function once and resolves its single value: the
 * bound-field object, or `null`. Must stop its work when `signal` aborts.
 */
export type ConfirmQuery = (
  args: ConfirmArgs,
  signal: AbortSignal
) => Promise<unknown>;

/** The function's JSON object; any other shape is an error. */
export const confirmedFieldsSchema = z
  .object({
    client_id: z.uuid(),
    acs_url: z.string().min(1).max(2048),
    sp_entity_id: z.string().min(1).max(2048),
    in_response_to: samlIdSchema,
    subject: z.string().regex(/^[0-9a-f]{64}$/u),
    email: z.string().min(1).max(254),
    given_name: z.string().max(128),
    family_name: z.string().max(128),
    kid: kidSchema,
  })
  .strict();
export type ConfirmedFields = z.infer<typeof confirmedFieldsSchema>;

/** The request with every database-bound field replaced by its stored value. */
export function boundInput(input: SignInput, row: ConfirmedFields): SignInput {
  return {
    ...input,
    client: row.client_id,
    kid: row.kid,
    subject: row.subject,
    attributes: {
      email: row.email,
      firstName: row.given_name,
      lastName: row.family_name,
    },
    profile: { entityId: row.sp_entity_id, acsUrl: row.acs_url },
    request: { ...input.request, id: row.in_response_to },
  };
}

const UNAVAILABLE = Object.freeze({
  ok: false,
  error: 'confirmation_unavailable',
} as const);
const UNCONFIRMED = Object.freeze({
  ok: false,
  error: 'transaction_unconfirmed',
} as const);
const CONFIRMED = Object.freeze({ ok: true } as const);

const TIMED_OUT = Symbol('timed out');

async function once(
  query: ConfirmQuery,
  args: ConfirmArgs,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    const result = await Promise.race([
      query(args, controller.signal),
      deadline,
    ]);
    if (result === TIMED_OUT) throw new Error('confirmation timed out');
    return result;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export function createDatabaseConfirmation(deps: {
  query: ConfirmQuery;
  timeoutMs?: number;
}): TransactionConfirmation {
  const timeoutMs = deps.timeoutMs ?? CONFIRMATION_TIMEOUT_MS;
  return {
    async confirm(input, permit): Promise<ConfirmationResult> {
      let value: unknown;
      try {
        value = await once(
          deps.query,
          {
            transactionId: input.transactionId,
            clientId: input.client,
            kid: input.kid,
          },
          timeoutMs
        );
      } catch {
        return UNAVAILABLE;
      }
      if (value === null) return UNCONFIRMED;
      const row = confirmedFieldsSchema.safeParse(value);
      if (!row.success) return UNAVAILABLE;
      try {
        const bound = boundInput(input, row.data);
        if (canonicalJson(bound) !== canonicalJson(input)) return UNCONFIRMED;
        if ((await fieldsHash(bound)) !== permit.fields) return UNCONFIRMED;
      } catch {
        return UNCONFIRMED;
      }
      return CONFIRMED;
    },
  };
}
