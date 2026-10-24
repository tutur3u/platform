import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type {
  NativeIntegrityBinding,
  NativeIntegrityChallenge,
  NativeIntegrityChallengeResponse,
  NativeIntegrityDependencies,
  NativeIntegrityMechanism,
  NativeIntegrityProof,
  NativeIntegrityReason,
  NativeIntegrityResult,
} from './native-integrity-types';

export type * from './native-integrity-types';

const hashSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine(
    (value) => Buffer.from(value, 'base64url').toString('base64url') === value
  );
const bindingSchema = z.object({
  actorId: z.string().min(1).max(128),
  method: z.enum(['GET', 'PATCH']),
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(
      /^\/api\/v1\/(?:users\/calendar-settings|workspaces\/[a-zA-Z0-9_-]+\/calendar-settings)$/
    ),
  bodyHash: hashSchema,
});
const keyIdSchema = z.string().min(1).max(256);
const proofSchema = z
  .object({
    challengeId: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
    keyId: keyIdSchema.optional(),
    assertion: z.string().min(1).max(16_384).optional(),
    token: z.string().min(1).max(16_384).optional(),
  })
  .strict();
export class NativeIntegrityError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string
  ) {
    super(reason);
  }
}
export function hashNativeIntegrityBody(body: Uint8Array | string): string {
  return createHash('sha256').update(body).digest('base64url');
}
export function decodeNativeIntegrityProof(
  header: string | null
): NativeIntegrityProof | null {
  if (!header || header.length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(header))
    return null;
  try {
    return proofSchema.parse(
      JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
    );
  } catch {
    return null;
  }
}
function matches(
  challenge: NativeIntegrityChallenge,
  binding: NativeIntegrityBinding
) {
  return (
    challenge.actorId === binding.actorId &&
    challenge.method === binding.method &&
    challenge.path === binding.path &&
    challenge.bodyHash === binding.bodyHash
  );
}

export class NativeIntegrityService {
  private readonly now: () => number;
  constructor(private readonly deps: NativeIntegrityDependencies) {
    this.now = deps.now ?? Date.now;
  }
  private result(reason: NativeIntegrityReason): NativeIntegrityResult {
    return {
      allowed: this.deps.mode !== 'enforce' || reason === 'verified',
      mode: this.deps.mode,
      reason,
    };
  }
  private async fallbackDenial(
    actorId: string
  ): Promise<NativeIntegrityReason | null> {
    if (!this.deps.allowTurnstile) return 'fallback-disabled';
    try {
      if (await this.deps.store.hasNativeCapability(actorId))
        return 'native-proof-required';
    } catch {
      return 'store-unavailable';
    }
    if (!this.deps.turnstileActorEligibility) return 'fallback-ineligible';
    try {
      return (await this.deps.turnstileActorEligibility(actorId)) ===
        'unsupported-platform'
        ? null
        : 'fallback-ineligible';
    } catch {
      return 'provider-unavailable';
    }
  }
  async issue(
    input: NativeIntegrityBinding & {
      purpose: 'request' | 'enroll';
      keyId?: string;
    }
  ): Promise<NativeIntegrityChallengeResponse> {
    if (this.deps.mode === 'off') return { mode: 'off' };
    const binding = bindingSchema.parse(input);
    if (
      input.purpose === 'enroll' &&
      !keyIdSchema.safeParse(input.keyId).success
    )
      throw new NativeIntegrityError(400, 'invalid-key');
    if (input.purpose !== 'enroll' && input.purpose !== 'request')
      throw new NativeIntegrityError(400, 'invalid-purpose');
    const bytes = this.deps.randomBytes ?? randomBytes;
    const id = Buffer.from(bytes(24)).toString('base64url');
    const nonce = bytes(32);
    const canonical = JSON.stringify([
      binding.actorId,
      binding.method,
      binding.path,
      binding.bodyHash,
      input.purpose,
      input.keyId ?? '',
    ]);
    const requestHash = createHash('sha256')
      .update(nonce)
      .update(canonical)
      .digest('base64url');
    const record: NativeIntegrityChallenge = {
      ...binding,
      id,
      purpose: input.purpose,
      ...(input.keyId ? { keyId: input.keyId } : {}),
      requestHash,
      expiresAt: this.now() + 120_000,
    };
    let stored: boolean;
    try {
      stored = await this.deps.store.issueChallenge(record, {
        limit: 10,
        windowSeconds: 60,
      });
    } catch {
      throw new NativeIntegrityError(503, 'store-unavailable');
    }
    if (!stored) throw new NativeIntegrityError(429, 'challenge-quota');
    const fallbackDenial = await this.fallbackDenial(binding.actorId);
    return {
      mode: this.deps.mode,
      challengeId: id,
      requestHash,
      expiresAt: record.expiresAt,
      ...(this.deps.cloudProjectNumber
        ? { cloudProjectNumber: this.deps.cloudProjectNumber }
        : {}),
      ...(fallbackDenial === null &&
      this.deps.turnstileSiteKey &&
      this.deps.turnstileUrl
        ? {
            turnstileSiteKey: this.deps.turnstileSiteKey,
            turnstileUrl: this.deps.turnstileUrl,
          }
        : {}),
    };
  }
  async enroll(input: {
    actorId: string;
    challengeId: string;
    keyId: string;
    attestation: string;
  }): Promise<NativeIntegrityResult> {
    if (this.deps.mode === 'off') return this.result('off');
    if (
      !keyIdSchema.safeParse(input.keyId).success ||
      typeof input.attestation !== 'string' ||
      input.attestation.length > 32_768 ||
      !/^[A-Za-z0-9_-]{32,64}$/.test(input.challengeId)
    )
      return this.result('invalid-proof');
    let challenge: NativeIntegrityChallenge | null;
    try {
      challenge = await this.deps.store.consumeChallenge(input.challengeId);
    } catch {
      return this.result('store-unavailable');
    }
    if (!challenge || challenge.expiresAt <= this.now())
      return this.result('expired-challenge');
    if (
      challenge.actorId !== input.actorId ||
      challenge.purpose !== 'enroll' ||
      challenge.keyId !== input.keyId
    )
      return this.result('binding-mismatch');
    try {
      const key = await this.deps.verifiers.attest({
        attestation: input.attestation,
        keyId: input.keyId,
        requestHash: challenge.requestHash,
      });
      if (key.environment !== 'production' && !this.deps.allowDevelopmentApple)
        return this.result('invalid-proof');
      try {
        const registered = await this.deps.store.registerKey(
          input.actorId,
          input.keyId,
          { ...key, actorId: input.actorId, counter: 0 }
        );
        return this.result(registered ? 'verified' : 'counter-conflict');
      } catch {
        return this.result('store-unavailable');
      }
    } catch {
      return this.result('invalid-proof');
    }
  }
  async verify(
    input: NativeIntegrityBinding & {
      mechanism: NativeIntegrityMechanism;
      proof?: unknown;
    }
  ): Promise<NativeIntegrityResult> {
    if (this.deps.mode === 'off') return this.result('off');
    const parsed = proofSchema.safeParse(input.proof);
    if (!parsed.success || !bindingSchema.safeParse(input).success)
      return this.result(input.proof ? 'invalid-proof' : 'missing-proof');
    const proof = parsed.data;
    let challenge: NativeIntegrityChallenge | null;
    try {
      challenge = await this.deps.store.consumeChallenge(proof.challengeId);
    } catch {
      return this.result('store-unavailable');
    }
    if (!challenge || challenge.expiresAt <= this.now())
      return this.result('expired-challenge');
    if (
      challenge.purpose !== 'request' ||
      !matches(challenge, input) ||
      (challenge.keyId && challenge.keyId !== proof.keyId)
    )
      return this.result('binding-mismatch');
    try {
      if (input.mechanism === 'app-attest') {
        if (!proof.keyId || !proof.assertion)
          return this.result('invalid-proof');
        let key: Awaited<
          ReturnType<NativeIntegrityDependencies['store']['getKey']>
        >;
        try {
          key = await this.deps.store.getKey(input.actorId, proof.keyId);
        } catch {
          return this.result('store-unavailable');
        }
        if (
          !key ||
          key.actorId !== input.actorId ||
          (key.environment !== 'production' && !this.deps.allowDevelopmentApple)
        )
          return this.result('unknown-key');
        const next = await this.deps.verifiers.assert({
          assertion: proof.assertion,
          publicKey: key.publicKey,
          platform: key.platform,
          counter: key.counter,
          requestHash: challenge.requestHash,
        });
        if (
          !Number.isSafeInteger(next) ||
          next <= key.counter ||
          next > 0xffffffff
        )
          return this.result('invalid-proof');
        try {
          if (
            !(await this.deps.store.advanceCounter(
              input.actorId,
              proof.keyId,
              key.counter,
              next
            ))
          )
            return this.result('counter-conflict');
        } catch {
          return this.result('store-unavailable');
        }
      } else if (input.mechanism === 'play-integrity') {
        if (!proof.token) return this.result('invalid-proof');
        await this.deps.verifiers.play({
          token: proof.token,
          requestHash: challenge.requestHash,
        });
        try {
          await this.deps.store.recordVerifiedPlayCapability(input.actorId);
        } catch {
          return this.result('store-unavailable');
        }
      } else if (input.mechanism === 'turnstile') {
        const denied = await this.fallbackDenial(input.actorId);
        if (denied) return this.result(denied);
        if (!proof.token) return this.result('invalid-proof');
        await this.deps.verifiers.turnstile({
          token: proof.token,
          requestHash: challenge.requestHash,
        });
        const changedPolicy = await this.fallbackDenial(input.actorId);
        if (changedPolicy) return this.result(changedPolicy);
      } else return this.result('invalid-proof');
      return this.result('verified');
    } catch {
      return this.result('invalid-proof');
    }
  }
}

export { createAppleIntegrityVerifier } from './native-integrity-apple';
export { createPlayIntegrityVerifier } from './native-integrity-play';
