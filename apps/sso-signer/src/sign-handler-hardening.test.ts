import { fixture } from '@tuturuuu/sso/testing';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  keyMapText,
  randomToken,
  signedRequest,
  signerHarness,
  signInput,
} from './__tests__/harness';
import type { SignInput } from './input';
import { guardPorts } from './ports';
import { createSignHandler, SIGN_PATH } from './sign-handler';
import type { TransactionConfirmation } from './transaction-confirmation';

afterEach(() => {
  vi.restoreAllMocks();
});

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

/** A confirmation that accepts every transaction, as the database would. */
const confirmAll = (): TransactionConfirmation => ({
  confirm: async () => ({ ok: true }),
});

describe('single use per transaction', () => {
  it('signs once for two distinct permits and nonces of one transaction', async () => {
    const h = await signerHarness({ confirmation: confirmAll() });
    const input = signInput(h.f);
    const send = async () =>
      signedRequest({
        requestKey: h.requestKey.raw,
        body: { input, permit: await h.permitFor(input) },
      });
    const signer = vi.spyOn(h.deps, 'createSigner');
    expect((await h.handle(await send())).status).toBe(200);
    const second = await h.handle(await send());
    expect(second.status).toBe(409);
    expect((await body(second)).error).toBe('replayed');
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it('signs once when the copies race', async () => {
    const h = await signerHarness({ confirmation: confirmAll() });
    const input = signInput(h.f);
    const requests = await Promise.all(
      Array.from({ length: 4 }, async () =>
        signedRequest({
          requestKey: h.requestKey.raw,
          body: { input, permit: await h.permitFor(input) },
        })
      )
    );
    const statuses = (
      await Promise.all(requests.map((request) => h.handle(request)))
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([200, 409, 409, 409]);
  });

  it('treats an upper-case spelling as the same transaction', async () => {
    const h = await signerHarness({ confirmation: confirmAll() });
    const input = signInput(h.f);
    const upper = {
      ...input,
      transactionId: input.transactionId.toUpperCase(),
    };
    expect((await h.handle(await h.validRequest(input))).status).toBe(200);
    const response = await h.handle(await h.validRequest(upper));
    expect(response.status).toBe(409);
  });

  it('spends the transaction even when the confirmation refuses', async () => {
    const confirmation: TransactionConfirmation = {
      confirm: async () => ({ ok: false, error: 'confirmation_unavailable' }),
    };
    const h = await signerHarness({ confirmation });
    const input = signInput(h.f);
    expect((await h.handle(await h.validRequest(input))).status).toBe(503);
    confirmation.confirm = async () => ({ ok: true });
    expect((await h.handle(await h.validRequest(input))).status).toBe(409);
  });

  it('claims the replay before the budget, so a replay spends nothing', async () => {
    const h = await signerHarness({ budget: 1 });
    const request = await h.validRequest();
    const copy = request.clone() as unknown as Request;
    expect((await h.handle(request)).status).toBe(200);
    expect(h.state.budgetReserves).toBe(1);
    expect((await h.handle(copy)).status).toBe(409);
    expect(h.state.budgetReserves).toBe(1);
  });
});

describe('budget cost bound', () => {
  it('refuses a remembered exhaustion before claiming anything', async () => {
    const h = await signerHarness({ budget: 1 });
    let claims = 0;
    const guards = guardPorts({
      control: h.deps.control,
      budget: h.deps.budget,
      now: () => Date.now(),
    });
    const handle = createSignHandler({
      ...h.deps,
      budget: guards.budget,
      replay: {
        claim: async (tokens, nowMs) => {
          claims += 1;
          return h.deps.replay.claim(tokens, nowMs);
        },
      },
    });
    expect((await handle(await h.validRequest())).status).toBe(200);
    expect((await handle(await h.validRequest())).status).toBe(429);
    expect(claims).toBe(2);
    const flooded = await handle(await h.validRequest());
    expect(flooded.status).toBe(429);
    expect(claims).toBe(2);
    expect(h.state.budgetReserves).toBe(2);
  });
});

describe('environment binding', () => {
  it('refuses a request signed for another environment', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        body: { input, permit: await h.permitFor(input) },
        audience: 'production',
      })
    );
    expect(response.status).toBe(401);
    expect(h.state.fenceReads).toBe(0);
  });

  it('refuses a permit minted for another environment', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const permit = await h.permitFor(input, { audience: 'production' });
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        body: { input, permit },
      })
    );
    expect(response.status).toBe(403);
    expect((await body(response)).error).toBe('permit_invalid');
    expect(h.state.fenceReads).toBe(0);
  });

  it('is misconfigured without an environment and touches no object', async () => {
    const h = await signerHarness({ environment: null });
    const response = await h.handle(await h.validRequest());
    expect(response.status).toBe(503);
    expect((await body(response)).error).toBe('misconfigured');
    expect(h.state.fenceReads).toBe(0);
  });
});

describe('request tampering', () => {
  it('refuses a timestamp 61 seconds from the Worker clock', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    for (const offset of [-61_000, 61_000]) {
      const response = await h.handle(
        await signedRequest({
          requestKey: h.requestKey.raw,
          body: { input, permit: await h.permitFor(input) },
          nowMs: Date.now() + offset,
        })
      );
      expect(response.status).toBe(401);
    }
    expect(h.state.fenceReads).toBe(0);
  });

  it.each([
    ['another method', { signedMethod: 'PUT' }],
    ['another path', { signedPath: '/v1/saml/other' }],
    ['a query string', { signedPath: `${SIGN_PATH}?x=1` }],
  ])('refuses a signature made for %s', async (_label, over) => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        body: { input, permit: await h.permitFor(input) },
        ...over,
      })
    );
    expect(response.status).toBe(401);
    expect(h.state.fenceReads).toBe(0);
  });

  it('refuses __proto__ members, duplicate keys and non-compact bodies', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const permit = await h.permitFor(input);
    const good = JSON.stringify({ input, permit });
    const inputText = JSON.stringify(input);
    const other = JSON.stringify({ ...input, subject: 'a'.repeat(64) });
    for (const rawBody of [
      `${good.slice(0, -1)},"__proto__":{"polluted":true}}`,
      good.replace('{"input":{', '{"input":{"__proto__":{"admin":true},'),
      `{"input":${other},"input":${inputText},"permit":${JSON.stringify(permit)}}`,
      good.replace('"kid":', '"kid":"other","kid":'),
      ` ${good}`,
      JSON.stringify({ input, permit }, null, 1),
    ]) {
      const response = await h.handle(
        await signedRequest({
          requestKey: h.requestKey.raw,
          body: null,
          rawBody,
        })
      );
      expect(response.status, rawBody.slice(0, 60)).toBe(400);
      expect((await body(response)).error).toBe('invalid_request');
    }
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(h.state.fenceReads).toBe(0);
  });
});

describe('coded failures', () => {
  it('answers misconfigured, never a raw message, when the config throws', async () => {
    const h = await signerHarness();
    const handle = createSignHandler({
      ...h.deps,
      config: () => {
        throw new Error('SSO_SIGNER_KEYS secret detail');
      },
    });
    const response = await handle(await h.validRequest());
    expect(response.status).toBe(503);
    const result = await body(response);
    expect(Object.keys(result).sort()).toEqual(['correlationId', 'error']);
    expect(JSON.stringify(result)).not.toContain('secret detail');
  });

  it('answers unavailable when a Durable Object call throws', async () => {
    const h = await signerHarness();
    const handle = createSignHandler({
      ...h.deps,
      replay: {
        claim: async () => {
          throw new Error('object detail');
        },
      },
    });
    const response = await handle(await h.validRequest());
    expect(response.status).toBe(503);
    expect(await body(response)).toMatchObject({ error: 'unavailable' });
  });

  it('refuses a valid permit aimed at a service provider the kid is not bound to', async () => {
    for (const binding of [
      { entityId: 'urn:example:other:sp' },
      { acsOrigins: ['https://other.example.test'] },
    ]) {
      const h = await signerHarness({ keyMap: keyMapText(fixture(), binding) });
      const response = await h.handle(await h.validRequest());
      expect(response.status).toBe(403);
      expect((await body(response)).error).toBe('key_binding');
      expect(h.state.fenceReads).toBe(0);
    }
  });

  it('logs no request header or token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = await signerHarness();
    const nonce = randomToken();
    const input = signInput(h.f);
    const request = await signedRequest({
      requestKey: h.requestKey.raw,
      body: { input, permit: await h.permitFor(input) },
      nonce,
      audience: 'production',
    });
    const signature = request.headers.get('x-ttr-sso-signature') ?? '';
    await h.handle(request);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(nonce);
    expect(logged).not.toContain(signature);
    expect(logged).not.toContain(input.transactionId);
  });
});

describe('freshness at signing', () => {
  /**
   * A handler on a controlled clock whose confirmation advances the clock by
   * `advanceMs`, as a slow database would, before the final checks.
   */
  async function slowConfirmation(advanceMs: number) {
    let clock = Date.now();
    const h = await signerHarness({
      confirmation: {
        confirm: async () => {
          clock += advanceMs;
          return { ok: true };
        },
      },
    });
    vi.spyOn(h.deps, 'now').mockImplementation(() => clock);
    const signer = vi.spyOn(h.deps, 'createSigner');
    const input = signInput(h.f, clock);
    return { h, signer, input, at: () => clock };
  }

  it('control: a confirmation inside every window signs', async () => {
    const { h, signer, input, at } = await slowConfirmation(1_000);
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        nowMs: at(),
        body: {
          input,
          permit: await h.permitFor(input, { nowMs: at(), lifetimeMs: 30_000 }),
        },
      })
    );
    expect(response.status).toBe(200);
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it('refuses when the permit expires during confirmation, and signs nothing', async () => {
    const { h, signer, input, at } = await slowConfirmation(31_000);
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        nowMs: at(),
        body: {
          input,
          permit: await h.permitFor(input, { nowMs: at(), lifetimeMs: 30_000 }),
        },
      })
    );
    expect(response.status).toBe(403);
    expect((await body(response)).error).toBe('permit_expired');
    expect(signer).not.toHaveBeenCalled();
  });

  it('refuses when the request HMAC leaves the skew window during confirmation', async () => {
    // Signed 50 s ago (inside the 60 s skew), permit still valid at signing.
    const { h, signer, input, at } = await slowConfirmation(15_000);
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        nowMs: at() - 50_000,
        body: {
          input,
          permit: await h.permitFor(input, { nowMs: at(), lifetimeMs: 60_000 }),
        },
      })
    );
    expect(response.status).toBe(401);
    expect((await body(response)).error).toBe('unauthenticated');
    expect(signer).not.toHaveBeenCalled();
  });
});

describe('ill-formed strings', () => {
  it('refuses an escaped lone surrogate before any object call', async () => {
    const h = await signerHarness({ confirmation: confirmAll() });
    const claim = vi.spyOn(h.deps.replay, 'claim');
    const input = signInput(h.f);
    const permit = await h.permitFor(input);
    for (const relayState of ['\ud800', 'x\udc00']) {
      const bad: SignInput = {
        ...input,
        request: { ...input.request, relayState },
      };
      // JSON.stringify escapes the lone surrogate, so the body is valid JSON.
      const request = await signedRequest({
        requestKey: h.requestKey.raw,
        body: { input: bad, permit },
      });
      const response = await h.handle(request);
      expect(response.status).toBe(400);
      expect((await body(response)).error).toBe('invalid_request');
    }
    expect(h.state.fenceReads).toBe(0);
    expect(h.state.budgetReserves).toBe(0);
    expect(claim).not.toHaveBeenCalled();
  });
});
