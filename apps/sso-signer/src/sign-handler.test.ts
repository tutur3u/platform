import { SAML } from '@tuturuuu/sso';
import { fixture, serviceProvider } from '@tuturuuu/sso/testing';
import { DOMParser } from '@xmldom/xmldom';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  keyMapText,
  randomToken,
  signedRequest,
  signerHarness,
  signInput,
} from './__tests__/harness';
import {
  refuseAllConfirmation,
  type TransactionConfirmation,
} from './transaction-confirmation';

afterEach(() => {
  vi.restoreAllMocks();
});

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('sign handler end to end', () => {
  it('builds and signs a response that the Node-SAML SP accepts', async () => {
    const h = await signerHarness();
    const response = await h.handle(await h.validRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = await body(response);
    expect(Object.keys(result).sort()).toEqual([
      'assertionId',
      'correlationId',
      'destination',
      'expiresAt',
      'relayState',
      'responseId',
      'samlResponse',
    ]);
    const xml = Buffer.from(String(result.samlResponse), 'base64').toString();
    const profile = await (await serviceProvider(h.f)).accept(xml);
    expect(profile.nameID).toBe(h.f.identity.pairwiseSubject);
    expect(profile.attributes).toEqual({
      id: h.f.identity.pairwiseSubject,
      email: h.f.identity.email,
      firstName: h.f.identity.firstName,
      lastName: h.f.identity.lastName,
    });
    expect(profile.inResponseTo).toBe(h.f.request.id);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const signatures = Array.from(
      doc.getElementsByTagNameNS(SAML.signature, 'Signature')
    ).map((signature) => signature.parentNode?.localName);
    expect(signatures.sort()).toEqual(['Assertion', 'Response']);
    expect(result.destination).toBe(h.f.profile.acsUrl);
    expect(result.relayState).toBe('opaque-handle');
  });

  it('puts the permitted NotOnOrAfter into the assertion', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const result = await body(await h.handle(await h.validRequest(input)));
    expect(result.expiresAt).toBe(input.notOnOrAfter);
  });

  it('logs only the correlation ID and an outcome code', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = await signerHarness();
    const ok = await body(await h.handle(await h.validRequest()));
    const refused = await h.handle(
      await signedRequest({ requestKey: h.requestKey.raw, body: { input: 1 } })
    );
    expect(refused.status).toBe(400);
    expect(info.mock.calls).toEqual([
      ['[sso-signer] signed', ok.correlationId],
    ]);
    expect(warn.mock.calls).toHaveLength(1);
    expect(warn.mock.calls[0]?.slice(2)).toEqual(['invalid_request']);
    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    for (const value of [
      h.f.identity.email,
      h.f.identity.pairwiseSubject,
      h.f.identity.lastName,
    ]) {
      expect(logged).not.toContain(value);
    }
  });
});

describe('sign handler refusals', () => {
  it('refuses a replayed request, then a replayed permit under a fresh nonce', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const permit = await h.permitFor(input);
    const send = (nonce?: string) =>
      signedRequest({
        requestKey: h.requestKey.raw,
        body: { input, permit },
        nonce,
      });
    const nonce = randomToken();
    expect((await h.handle(await send(nonce))).status).toBe(200);
    const replayed = await h.handle(await send(nonce));
    expect(replayed.status).toBe(409);
    expect((await body(replayed)).error).toBe('replayed');
    expect((await h.handle(await send())).status).toBe(409);
  });

  it('keeps replay rows past the edge of acceptance', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const permit = await h.permitFor(input);
    const nonce = randomToken();
    const sentAt = Date.now();
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        body: { input, permit },
        nonce,
        nowMs: sentAt,
      })
    );
    expect(response.status).toBe(200);
    // Just past each acceptance window the rows are still there.
    const afterNonce = sentAt + 60_001;
    expect(
      h.replay.claim(
        [{ kind: 'nonce', token: nonce, expiresAtMs: afterNonce + 1_000 }],
        afterNonce
      )
    ).toEqual({ ok: false, error: 'replayed' });
    const afterPermit = permit.exp + 1;
    expect(
      h.replay.claim(
        [
          {
            kind: 'permit',
            token: permit.id,
            expiresAtMs: afterPermit + 1_000,
          },
        ],
        afterPermit
      )
    ).toEqual({ ok: false, error: 'replayed' });
  });

  it('re-reads the fence before signing', async () => {
    const confirmation: TransactionConfirmation = {
      confirm: async () => ({ ok: true }),
    };
    const h = await signerHarness({ confirmation });
    // An operator stops the signer while the request is being checked.
    confirmation.confirm = async () => {
      h.state.fence = 'stopped';
      return { ok: true };
    };
    const signer = vi.spyOn(h.deps, 'createSigner');
    const response = await h.handle(await h.validRequest());
    expect(response.status).toBe(503);
    expect((await body(response)).error).toBe('stopped');
    expect(h.state.fenceReads).toBe(2);
    expect(signer).not.toHaveBeenCalled();
  });

  it('refuses a permit for other fields before any Durable Object call', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    const permit = await h.permitFor(input);
    const changed = {
      ...input,
      profile: {
        ...input.profile,
        acsUrl: 'https://attacker.example.test/acs',
      },
    };
    const response = await h.handle(
      await signedRequest({
        requestKey: h.requestKey.raw,
        body: { input: changed, permit },
      })
    );
    expect(response.status).toBe(403);
    expect((await body(response)).error).toBe('permit_invalid');
    expect(h.state.fenceReads).toBe(0);
  });

  it('refuses a kid bound to another client or protocol', async () => {
    for (const binding of [
      { client: '00000000-0000-4000-8000-000000000bad' },
      { protocol: 'oidc' },
    ]) {
      const harness = await signerHarness({
        keyMap: keyMapText(fixture(), binding),
      });
      const response = await harness.handle(await harness.validRequest());
      expect(response.status).toBe(403);
      expect((await body(response)).error).toBe('key_binding');
    }
  });

  it('answers 503 and signs nothing while the fence is stopped', async () => {
    const h = await signerHarness({ fence: 'stopped' });
    const signer = vi.spyOn(h.deps, 'createSigner');
    const response = await h.handle(await h.validRequest());
    expect(response.status).toBe(503);
    expect((await body(response)).error).toBe('stopped');
    expect(signer).not.toHaveBeenCalled();
    expect(h.replay.liveCount()).toBe(0);
  });

  it('answers 503 under a stopped floor without reading the fence', async () => {
    const h = await signerHarness({ fenceFloor: 'stopped' });
    const response = await h.handle(await h.validRequest());
    expect(response.status).toBe(503);
    expect(h.state.fenceReads).toBe(0);
  });

  it('caps admitted requests with the daily budget', async () => {
    const h = await signerHarness({ budget: 1 });
    expect((await h.handle(await h.validRequest())).status).toBe(200);
    const capped = await h.handle(await h.validRequest());
    expect(capped.status).toBe(429);
    expect(await body(capped)).toMatchObject({ error: 'budget_exhausted' });
  });

  it('refuses everything while no transaction confirmation is configured', async () => {
    const h = await signerHarness({ confirmation: refuseAllConfirmation });
    const response = await h.handle(await h.validRequest());
    expect(response.status).toBe(503);
    expect((await body(response)).error).toBe('confirmation_unavailable');
  });

  it('is misconfigured when the kid secret does not match its certificate', async () => {
    const h = await signerHarness();
    const other = (await signerHarness()).f.privateKey;
    h.secrets.SSO_SIGNING_KEY_SAML_TEST_1 = other;
    const response = await h.handle(await h.validRequest());
    expect(response.status).toBe(503);
    expect((await body(response)).error).toBe('misconfigured');
  });

  it('returns a protocol code when the builder refuses the fields', async () => {
    const h = await signerHarness();
    const input = signInput(h.f);
    input.assurance.mfaVerifiedAt = new Date(
      Date.now() - 3_600_000
    ).toISOString();
    input.assurance.authenticatedAt = input.assurance.mfaVerifiedAt;
    const response = await h.handle(await h.validRequest(input));
    expect(response.status).toBe(422);
    expect(await body(response)).toMatchObject({
      error: 'protocol',
      reason: 'FRESH_MFA_REQUIRED',
    });
  });

  it('answers only POST on the sign path, under the body cap', async () => {
    const h = await signerHarness();
    const valid = await h.validRequest();
    expect(
      (await h.handle(new Request(valid.url.replace('/sign', '/other'), valid)))
        .status
    ).toBe(404);
    expect(
      (await h.handle(new Request(`${valid.url}?x=1`, valid))).status
    ).toBe(404);
    expect(
      (
        await h.handle(
          await signedRequest({
            requestKey: h.requestKey.raw,
            body: {},
            method: 'GET',
          })
        )
      ).status
    ).toBe(405);
    const big = await signedRequest({
      requestKey: h.requestKey.raw,
      body: { pad: 'x'.repeat(20_000) },
    });
    expect((await h.handle(big)).status).toBe(413);
  });

  it('refuses an unsigned request with 401', async () => {
    const h = await signerHarness();
    const valid = await h.validRequest();
    const response = await h.handle(
      new Request(valid.url, { method: 'POST', body: await valid.text() })
    );
    expect(response.status).toBe(401);
    expect(h.state.fenceReads).toBe(0);
  });
});
