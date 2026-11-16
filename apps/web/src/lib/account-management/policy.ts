import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export class AccountManagementError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code);
  }
}

const uuid = z.uuid();
const bindingSchema = z
  .object({
    actorId: uuid,
    action: z.enum([
      'admin',
      'delete',
      'test-delete',
      'enroll',
      'rotate',
      'revoke',
    ]),
    targetId: uuid,
    bodyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export type ChallengeBinding = z.infer<typeof bindingSchema>;

const sessionClaims = z.object({
  aal: z.literal('aal2'),
  amr: z.array(
    z.object({
      method: z.string(),
      timestamp: z.number().int().nonnegative(),
    })
  ),
});

/** Claims must come from the server's verified session, never decoded client input. */
export function requireFreshFactor(
  verifiedClaims: unknown,
  nowSeconds: number
) {
  const parsed = sessionClaims.safeParse(verifiedClaims);
  if (
    !parsed.success ||
    !parsed.data.amr.some(
      ({ method, timestamp }) =>
        (method === 'totp' ||
          method === 'webauthn' ||
          method === 'mfa/webauthn') &&
        timestamp <= nowSeconds &&
        nowSeconds - timestamp <= 300
    )
  ) {
    throw new AccountManagementError('step_up_required', 401);
  }
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new AccountManagementError('invalid_body', 400);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`)
    .join(',')}}`;
}

export function canonicalBodyHash(body: JsonValue) {
  return createHash('sha256').update(canonical(body)).digest('hex');
}

export interface ChallengeStore {
  putIfAbsent(
    key: string,
    value: ChallengeBinding,
    ttlSeconds: 120
  ): Promise<boolean>;
  /** Must use atomic Redis GETDEL; a separate GET followed by DEL is unsafe. */
  getdel(key: string): Promise<unknown>;
}

export async function issueChallenge(
  store: ChallengeStore,
  binding: ChallengeBinding
) {
  const checked = bindingSchema.parse(binding);
  const nonce = randomBytes(16).toString('hex');
  if (!(await store.putIfAbsent(`accounts:challenge:${nonce}`, checked, 120))) {
    throw new AccountManagementError('challenge_unavailable', 503);
  }
  return { nonce, expiresIn: 120 };
}

export async function consumeChallenge(
  store: ChallengeStore,
  nonce: string,
  binding: ChallengeBinding
) {
  if (!/^[a-f0-9]{32}$/u.test(nonce)) {
    throw new AccountManagementError('challenge_conflict', 409);
  }
  const expected = bindingSchema.parse(binding);
  const stored = bindingSchema.safeParse(
    await store.getdel(`accounts:challenge:${nonce}`)
  );
  if (
    !stored.success ||
    stored.data.actorId !== expected.actorId ||
    stored.data.action !== expected.action ||
    stored.data.targetId !== expected.targetId ||
    stored.data.bodyHash !== expected.bodyHash
  ) {
    throw new AccountManagementError('challenge_conflict', 409);
  }
}

export function requireTargetConfirmation(
  targetId: string,
  confirmation: string | undefined
) {
  if (!uuid.safeParse(targetId).success || confirmation !== targetId) {
    throw new AccountManagementError('target_confirmation_required', 400);
  }
}

/** D292 must supply the durable manual-request pipeline before human deletion opens. */
export function rejectUnavailableHumanDeletion(): never {
  throw new AccountManagementError('deletion_pipeline_not_available', 503);
}
