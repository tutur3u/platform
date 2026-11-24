import { randomUUID } from 'node:crypto';
import { type Fixture, fixture } from '@tuturuuu/sso/testing';
import { createNodeSigner } from '@tuturuuu/sso/node-signer';
import { createBudgetStore } from '../budget-store';
import type { SignerEnvironment } from '../environment';
import type { SignInput } from '../input';
import { parseKeyMap } from '../key-binding';
import { type Bytes, encodeBase64Url, parseKeySet } from '../key-set';
import { type IssuedPermit, issuePermit } from '../permit';
import { createReplayStore } from '../replay-store';
import { signRequestHeaders } from '../request-auth';
import {
  createSignHandler,
  SIGN_PATH,
  type SignHandlerDeps,
} from '../sign-handler';
import {
  type TransactionConfirmation,
  uncheckedLocalConfirmation,
} from '../transaction-confirmation';
import { memorySql } from './sqlite';

export const KID = 'saml-test-1';
export const CLIENT = '00000000-0000-4000-8000-00000000c11e';
export const ORIGIN = 'https://sso-signer.internal';
/** The harness signer's `SSO_SIGNER_ENV`. */
export const AUDIENCE = 'local';

export async function permitKeyPair() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey)
  );
  return { privateKey: pair.privateKey, publicKey: encodeBase64Url(raw) };
}

export function randomKey() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return { raw, text: encodeBase64Url(raw) };
}

export const randomToken = () =>
  encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)));

export function signInput(f: Fixture, nowMs = Date.now()): SignInput {
  return {
    client: CLIENT,
    protocol: 'saml',
    transactionId: randomUUID(),
    kid: KID,
    subject: f.identity.pairwiseSubject,
    attributes: {
      email: f.identity.email,
      firstName: f.identity.firstName,
      lastName: f.identity.lastName,
    },
    profile: { entityId: f.profile.entityId, acsUrl: f.profile.acsUrl },
    idp: { entityId: f.idp.entityId, ssoUrl: f.idp.ssoUrl },
    request: {
      id: f.request.id,
      issueInstant: f.request.issueInstant,
      forceAuthn: f.request.forceAuthn,
      relayState: f.request.relayState,
    },
    assurance: {
      authenticatedAt: f.assurance.authenticatedAt,
      mfaVerifiedAt: f.assurance.mfaVerifiedAt,
    },
    notOnOrAfter: new Date(nowMs + 110_000).toISOString(),
  };
}

export function keyMapText(f: Fixture, binding: Record<string, unknown> = {}) {
  return JSON.stringify({
    [KID]: {
      client: CLIENT,
      protocol: 'saml',
      certificate: f.certificate,
      entityId: f.profile.entityId,
      acsOrigins: [new URL(f.profile.acsUrl).origin],
      ...binding,
    },
  });
}

export async function signedRequest(input: {
  requestKey: Bytes;
  body: unknown;
  /** Raw body text instead of `JSON.stringify(body)`. */
  rawBody?: string;
  audience?: string;
  nowMs?: number;
  nonce?: string;
  method?: string;
  path?: string;
  /** Sign for this method and path but send to `method` and `path`. */
  signedMethod?: string;
  signedPath?: string;
}) {
  const body = new TextEncoder().encode(
    input.rawBody ?? JSON.stringify(input.body)
  );
  const method = input.method ?? 'POST';
  const path = input.path ?? SIGN_PATH;
  const headers = await signRequestHeaders({
    key: input.requestKey,
    audience: input.audience ?? AUDIENCE,
    method: input.signedMethod ?? method,
    path: input.signedPath ?? path,
    body,
    nowMs: input.nowMs ?? Date.now(),
    nonce: input.nonce,
  });
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : body,
  });
}

/** A full handler over in-memory stores and the packages/sso fixture. */
export async function signerHarness(
  options: {
    fence?: 'running' | 'stopped';
    budget?: number;
    confirmation?: TransactionConfirmation;
    keyMap?: string;
    fenceFloor?: 'running' | 'stopped';
    environment?: SignerEnvironment | null;
  } = {}
) {
  const f = fixture();
  const requestKey = randomKey();
  const permitKeys = await permitKeyPair();
  const replayDb = memorySql();
  const budgetDb = memorySql();
  const replay = createReplayStore(replayDb.sql, replayDb.transaction);
  const budget = createBudgetStore(budgetDb.sql, budgetDb.transaction);
  const state = {
    fence: options.fence ?? 'running',
    fenceReads: 0,
    budgetReserves: 0,
  };
  const secrets: Record<string, string> = {
    SSO_SIGNING_KEY_SAML_TEST_1: f.privateKey,
  };
  const deps: SignHandlerDeps = {
    now: () => Date.now(),
    correlationId: () => randomUUID(),
    config: () => ({
      environment:
        options.environment === undefined ? AUDIENCE : options.environment,
      fenceFloor: options.fenceFloor ?? 'running',
      requestKeys: parseKeySet(requestKey.text),
      permitKeys: parseKeySet(permitKeys.publicKey),
      keyMap: parseKeyMap(options.keyMap ?? keyMapText(f)),
      secret: (name) => secrets[name],
    }),
    control: {
      fenceMode: async () => {
        state.fenceReads += 1;
        return state.fence;
      },
    },
    budget: {
      reserve: async (nowMs) => {
        state.budgetReserves += 1;
        return budget.reserve(nowMs, options.budget ?? 100);
      },
    },
    replay: { claim: async (tokens, nowMs) => replay.claim(tokens, nowMs) },
    confirmation: options.confirmation ?? uncheckedLocalConfirmation,
    createSigner: createNodeSigner,
  };
  const handle = createSignHandler(deps);
  const permitFor = (
    fields: SignInput,
    over: {
      id?: string;
      nowMs?: number;
      lifetimeMs?: number;
      audience?: string;
    } = {}
  ): Promise<IssuedPermit> =>
    issuePermit({
      privateKey: permitKeys.privateKey,
      audience: over.audience ?? AUDIENCE,
      fields,
      id: over.id ?? randomToken(),
      nowMs: over.nowMs ?? Date.now(),
      lifetimeMs: over.lifetimeMs,
    });
  /** One fresh, fully valid request for the fixture. */
  const validRequest = async (input = signInput(f)) =>
    signedRequest({
      requestKey: requestKey.raw,
      body: { input, permit: await permitFor(input) },
    });
  return {
    f,
    deps,
    handle,
    state,
    secrets,
    replay,
    requestKey,
    permitKeys,
    permitFor,
    validRequest,
  };
}
