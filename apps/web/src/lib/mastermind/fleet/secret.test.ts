import { describe, expect, it, vi } from 'vitest';
import {
  fleetAnswerInputSchema,
  fleetDecisionSchema,
  fleetStateSchema,
} from './contract';
import { sampleFleetState } from './sample-state.fixture';
import {
  ANSWER_DOMAIN,
  bindingBytes,
  ownerAnswerVerifies,
  ownerKeyId,
  ownerTranscript,
  REQUEST_DOMAIN,
  secretAnswerOpen,
  secretMfaMaxAgeSeconds,
  verifyEd25519,
} from './secret';
import { b64urlByteLength, fleetSecretRequestSchema } from './secret-contract';
import {
  OWNER_KEY,
  OWNER_KEY_ID,
  ownerAnswer,
  ownerSigner,
  rawPublicKey,
  secretFixture,
  secretPairDecision,
  secretRequestDecision,
  strangerSigner,
} from './secret.fixture';
import { answerPayloadDigest } from './store';
import { fleetStateView } from './view';

vi.mock('server-only', () => ({}));
vi.mock('./bridge', () => ({ replyAssurance: vi.fn() }));

const T0 = new Date('2026-11-22T10:00:00.000Z');
const fx = secretFixture;

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#binding-strings
describe('secret entry bindings match the shared byte fixture', () => {
  it('rebuilds the request and answer bindings byte for byte', () => {
    expect(bindingBytes(REQUEST_DOMAIN, fx.request).toString('hex')).toBe(
      fx.requestBindingHex
    );
    expect(bindingBytes(ANSWER_DOMAIN, fx.request).toString('hex')).toBe(
      fx.answerBindingHex
    );
    // The machine's own signature over the request binding.
    expect(
      verifyEd25519(
        Buffer.from(fx.request.signerKey, 'base64url'),
        bindingBytes(REQUEST_DOMAIN, fx.request),
        Buffer.from(fx.requestSig, 'base64url')
      )
    ).toBe(true);
  });

  it('derives the owner key id and rebuilds both owner transcripts', () => {
    expect(OWNER_KEY).toBe(fx.ownerKey);
    expect(ownerKeyId(Buffer.from(fx.ownerKey, 'base64url'))).toBe(
      fx.ownerKeyId
    );
    const answer = { ...fx.answer };
    const transcript = ownerTranscript(fx.request, answer);
    expect(transcript.toString('hex')).toBe(fx.ownerTranscriptHex);
    expect(
      ownerTranscript(fx.request, {
        ...answer,
        action: 'decline',
        enc: '',
        ct: '',
      }).toString('hex')
    ).toBe(fx.declineTranscriptHex);
    expect(
      verifyEd25519(
        Buffer.from(fx.ownerKey, 'base64url'),
        transcript,
        Buffer.from(fx.ownerSig, 'base64url')
      )
    ).toBe(true);
    const tampered = Buffer.from(fx.ownerSig, 'base64url');
    tampered[0]! ^= 1;
    expect(
      verifyEd25519(Buffer.from(fx.ownerKey, 'base64url'), transcript, tampered)
    ).toBe(false);
  });

  it('accepts the fixture owner signature only against its own request', () => {
    const request = {
      mode: 'request' as const,
      ...fx.request,
      sig: fx.requestSig,
    };
    const input = {
      action: 'secret' as const,
      sealed: { enc: fx.answer.enc, ct: fx.answer.ct },
      owner: {
        publicKey: fx.ownerKey,
        keyId: fx.ownerKeyId,
        signedAt: fx.answer.signedAt,
        sig: fx.ownerSig,
      },
    };
    expect(ownerAnswerVerifies(request, input)).toBe(true);
    expect(
      ownerAnswerVerifies({ ...request, operation: 'other-op' }, input)
    ).toBe(false);
    expect(ownerAnswerVerifies(request, { ...input, action: 'decline' })).toBe(
      false
    );
  });
});

describe('secret owner signature checks', () => {
  const decision = secretRequestDecision(T0);
  const request = decision.secret as Parameters<typeof ownerAnswerVerifies>[0];
  const verifies = (answer: ReturnType<typeof ownerAnswer>) =>
    ownerAnswerVerifies(request, fleetAnswerInputSchema.parse(answer));

  it('accepts a secret and a decline signed by an audience key', () => {
    expect(verifies(ownerAnswer(decision))).toBe(true);
    expect(verifies(ownerAnswer(decision, { action: 'decline' }))).toBe(true);
  });

  it('refuses a key outside the audience, a wrong key id and a late signature', () => {
    expect(verifies(ownerAnswer(decision, { signer: strangerSigner }))).toBe(
      false
    );
    expect(verifies(ownerAnswer(decision, { keyId: 'f'.repeat(32) }))).toBe(
      false
    );
    expect(
      verifies(
        ownerAnswer(decision, {
          signedAt: new Date(T0.getTime() + 10 * 60_000 + 1).toISOString(),
        })
      )
    ).toBe(false);
  });

  it('refuses a payload swapped after signing', () => {
    const answer = ownerAnswer(decision);
    const other = 'RERE' + answer.sealed!.ct.slice(4).replace(/^R/, 'S');
    expect(
      verifies({ ...answer, sealed: { ...answer.sealed!, ct: other } })
    ).toBe(false);
  });

  it('stops new answers 15 seconds before expiry', () => {
    const expires = T0.getTime() + 10 * 60_000;
    expect(secretAnswerOpen(request, expires - 15_000)).toBe(true);
    expect(secretAnswerOpen(request, expires - 14_999)).toBe(false);
  });

  it('bounds the step-up age between 60 and 300 seconds', () => {
    expect(secretMfaMaxAgeSeconds({})).toBe(300);
    expect(
      secretMfaMaxAgeSeconds({ MASTERMIND_SECRET_MFA_MAX_AGE_SECONDS: '120' })
    ).toBe(120);
    expect(
      secretMfaMaxAgeSeconds({ MASTERMIND_SECRET_MFA_MAX_AGE_SECONDS: '5' })
    ).toBe(60);
    expect(
      secretMfaMaxAgeSeconds({ MASTERMIND_SECRET_MFA_MAX_AGE_SECONDS: '3600' })
    ).toBe(300);
    expect(
      secretMfaMaxAgeSeconds({ MASTERMIND_SECRET_MFA_MAX_AGE_SECONDS: 'x' })
    ).toBe(300);
  });
});

describe('secret contract shapes', () => {
  it('checks canonical base64url lengths', () => {
    expect(b64urlByteLength(fx.ownerKey)).toBe(32);
    expect(b64urlByteLength(fx.ownerSig)).toBe(64);
    expect(b64urlByteLength(fx.answer.ct)).toBe(272);
    // Padding, stray low bits, a bad length and the standard alphabet.
    expect(b64urlByteLength(`${fx.ownerKey}=`)).toBeNull();
    expect(b64urlByteLength(`${fx.ownerKey.slice(0, -1)}B`)).toBeNull();
    expect(b64urlByteLength('AAAAA')).toBeNull();
    expect(b64urlByteLength('ab+/')).toBeNull();
    expect(rawPublicKey(ownerSigner).toString('base64url')).toBe(fx.ownerKey);
  });

  it('accepts a signed request and a pairing as decisions', () => {
    expect(
      fleetDecisionSchema.safeParse(secretRequestDecision(T0)).success
    ).toBe(true);
    expect(fleetDecisionSchema.safeParse(secretPairDecision(T0)).success).toBe(
      true
    );
  });

  it('refuses requests whose bound fields would need rewriting', () => {
    const refused = (decision: unknown) =>
      fleetDecisionSchema.safeParse(decision).success;
    const base = secretRequestDecision(T0);
    for (const [label, decision] of [
      [
        'a scrubbed purpose',
        secretRequestDecision(T0, {
          purpose: 'Open https://example.com/x now',
        }),
      ],
      [
        'a bare argv array',
        secretRequestDecision(T0, { command: '["/usr/bin/true"]' }),
      ],
      [
        'a control character',
        secretRequestDecision(T0, {
          command: JSON.stringify({ argv: ['/bin/echo', 'a\nb'] }),
        }),
      ],
      [
        'an unsorted audience',
        secretRequestDecision(T0, {
          audience: `${'f'.repeat(32)},${OWNER_KEY_ID}`,
        }),
      ],
      [
        'a 32-minute lifetime',
        secretRequestDecision(T0, { ttlMs: 32 * 60_000 }),
      ],
      ['an id mismatch', { ...base, id: 'secret-ffffffffffffffffffffffff' }],
      ['options', { ...base, options: [{ id: 'yes', label: 'Yes' }] }],
      ['a kind without payload', { ...base, secret: undefined }],
      ['a payload on an ask', { ...base, kind: 'ask' }],
      [
        'a time without milliseconds',
        {
          ...base,
          secret: { ...base.secret, expiresAt: '2026-11-22T10:10:00Z' },
        },
      ],
      [
        'a padded key',
        {
          ...base,
          secret: { ...base.secret, publicKey: `${base.secret.publicKey}=` },
        },
      ],
    ] as const)
      expect([label, refused(decision)]).toEqual([label, false]);
    expect(
      fleetSecretRequestSchema.safeParse({
        ...base.secret,
        requester: 'lane-x',
      }).success
    ).toBe(false);
  });

  it('caps secret decisions at ten per snapshot, on top of asks', () => {
    const ids = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        secretRequestDecision(T0, {
          id: `secret-${i.toString(16).padStart(24, '0')}`,
        })
      );
    const asks = Array.from({ length: 50 }, (_, i) => ({
      ...sampleFleetState().decisions[0],
      id: `ask-${i}`,
    }));
    expect(
      fleetStateSchema.safeParse(
        sampleFleetState({ decisions: [...asks, ...ids(10)] })
      ).success
    ).toBe(true);
    expect(
      fleetStateSchema.safeParse(sampleFleetState({ decisions: ids(11) }))
        .success
    ).toBe(false);
  });

  it('pairs each answer action with its own payload only', () => {
    const decision = secretRequestDecision(T0);
    const secret = ownerAnswer(decision);
    const parse = (input: unknown) =>
      fleetAnswerInputSchema.safeParse(input).success;
    expect(parse(secret)).toBe(true);
    expect(parse(ownerAnswer(decision, { action: 'decline' }))).toBe(true);
    expect(
      parse({
        action: 'pair',
        pair: { ownerKey: fx.ownerKey, ownerMac: fx.pairing.ownerMac },
      })
    ).toBe(true);
    expect(parse({ action: 'secret', owner: secret.owner })).toBe(false);
    expect(parse({ ...secret, action: 'decline' })).toBe(false);
    expect(parse({ ...secret, action: 'approve' })).toBe(false);
    expect(parse({ action: 'pair' })).toBe(false);
    expect(
      parse({
        ...secret,
        sealed: { ...secret.sealed, ct: secret.sealed!.ct.slice(0, -4) },
      })
    ).toBe(false);
    expect(
      parse({ ...secret, sealed: { ...secret.sealed, enc: fx.ownerSig } })
    ).toBe(false);
    expect(
      parse({
        ...secret,
        owner: { ...secret.owner, signedAt: '2026-11-22T10:05:00Z' },
      })
    ).toBe(false);
  });

  it('digests secret payloads and leaves other answers without one', () => {
    const secret = fleetAnswerInputSchema.parse(
      ownerAnswer(secretRequestDecision(T0))
    );
    expect(answerPayloadDigest(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      answerPayloadDigest({
        ...secret,
        owner: { ...secret.owner!, signedAt: T0.toISOString() },
      })
    ).toBe(answerPayloadDigest(secret));
    expect(answerPayloadDigest({ action: 'approve' } as never)).toBeUndefined();
  });
});

describe('secret owner read', () => {
  const state = fleetStateSchema.parse(
    sampleFleetState({
      decisions: [
        sampleFleetState().decisions[0],
        secretRequestDecision(T0),
        secretPairDecision(T0),
      ],
      resolved: [
        {
          id: 'secret-ffffffffffffffffffffffff',
          kind: 'secret',
          title: 'Earlier request',
          resolvedAt: T0.toISOString(),
          secretOutcome: {
            outcome: 'delivered',
            answerDigest: fx.answerDigest,
            sig: fx.outcome.sig,
          },
        },
      ],
    })
  );

  it('hides secret requests and outcomes from clients without the feature', () => {
    const view = fleetStateView(state, { now: T0 });
    expect(view.decisions.map((d) => d.kind)).toEqual(['ask']);
    expect(view.resolved).toEqual([]);
    const opted = fleetStateView(state, {
      now: T0,
      features: new Set(['secret']),
    });
    expect(opted.decisions.map((d) => d.kind)).toEqual([
      'ask',
      'secret',
      'secret',
    ]);
    expect(opted.resolved).toHaveLength(1);
  });

  it('reads a request as closed once Web stops taking answers', () => {
    const view = fleetStateView(state, {
      now: new Date(T0.getTime() + 10 * 60_000 - 14_000),
      features: new Set(['secret']),
    });
    expect(view.decisions.map((d) => d.kind)).toEqual(['ask']);
  });

  it('refuses a secret outcome on another kind', () => {
    expect(
      fleetStateSchema.safeParse(
        sampleFleetState({
          resolved: [
            {
              id: 'ship',
              kind: 'ask',
              title: 'Ship',
              resolvedAt: T0.toISOString(),
              secretOutcome: {
                outcome: 'delivered',
                answerDigest: '',
                sig: fx.outcome.sig,
              },
            },
          ],
        })
      ).success
    ).toBe(false);
  });
});
