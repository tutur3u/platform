// @vitest-environment node
vi.mock('server-only', () => ({}));

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BrowserState,
  cookieName,
  csrfFor,
  opaque,
  seal,
  unseal,
} from '@/lib/sso/browser-state';
import { configuration, hash } from '@/lib/sso/config';
import { managementPrincipal } from '@/lib/sso/identity';
import { adminClient, snapshot } from '@/lib/sso/store';
import {
  type Fixture,
  fixture,
  serviceProvider,
} from '../../../../../../../packages/sso/src/__tests__/fixture';
import ConsentPage from '../../../[locale]/(auth)/sso/consent/page';
import { GET as metadata } from './saml/[clientId]/metadata/route';
import { POST as postStart, GET as start } from './saml/[clientId]/sso/route';
import { POST as decision } from './transactions/[transactionId]/decision/route';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  getUserById: vi.fn(),
  limiter: vi.fn(),
  cookies: vi.fn(),
  headers: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: mocks.rpc,
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
vi.mock('@tuturuuu/supabase/request/server', () => ({
  createRequestClient: async () => ({
    auth: { getUser: mocks.getUser, getClaims: mocks.getClaims },
  }),
}));
vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('../../../[locale]/(auth)/sso/consent/reauthenticate', () => ({
  Reauthenticate: () => null,
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitRedis: mocks.limiter }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

let f: Fixture;
const clientId = '00000000-0000-4000-8000-000000000001';
const wsId = '00000000-0000-4000-8000-000000000002';
const keyId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000004';
const origin = 'https://idp.example.test/';
const base = `${origin}api/v1/sso/saml/${clientId}`;
const context = { params: Promise.resolve({ clientId }) };
let member = true;
let assigned = true;
let consumed = false;
let failRpc = '';
let transactionId: string;
let events: string[];
let mfaTime: number;
let factor: string | null;
let starterBinding: string | null;
let currentSnapshot: ReturnType<typeof row>;
function row() {
  return {
    client: {
      id: clientId,
      ws_id: wsId,
      display_name: 'Claude fixture',
      enabled: true,
      policy_revision: 1,
      approved_email_domains: ['example.test'],
    },
    saml: {
      entity_id: f.profile.entityId,
      acs_urls: [f.profile.acsUrl],
      name_id_format: f.profile.nameIdFormat,
    },
    key: {
      id: keyId,
      kid: 'pilot',
      revision: 1,
      public_certificate: f.certificate,
      status: 'active',
    },
    member,
    assigned,
  };
}
beforeAll(() => {
  f = fixture();
});
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  member = true;
  assigned = true;
  consumed = false;
  failRpc = '';
  events = [];
  factor = 'factor';
  starterBinding = null;
  transactionId = randomUUID();
  mfaTime = Math.floor(Date.now() / 1000);
  vi.stubEnv('SSO_SAML_ENABLED', 'true');
  vi.stubEnv('SSO_SAML_ORIGIN', origin);
  vi.stubEnv('SSO_SAML_CLIENT_ID', clientId);
  vi.stubEnv('SSO_SAML_SIGNING_KID', 'pilot');
  vi.stubEnv('SSO_SAML_SIGNING_KEY', f.privateKey);
  vi.stubEnv('SSO_SAML_TRANSACTION_SECRET', 'a'.repeat(43));
  vi.stubEnv('SSO_SAML_REQUEST_SIGNING', 'unsigned');
  const user = {
    id: actorId,
    email: 'member@example.test',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: { given_name: 'Given', family_name: 'Family' },
  };
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
  mocks.getClaims.mockImplementation(async () => ({
    data: {
      claims: {
        sub: actorId,
        aal: 'aal2',
        session_id: 'session',
        amr: [
          { method: 'password', timestamp: mfaTime - 1 },
          { method: 'totp', timestamp: mfaTime },
        ],
      },
    },
    error: null,
  }));
  mocks.limiter.mockResolvedValue({ allowed: true });
  currentSnapshot = row();
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === failRpc) return { error: { code: 'unavailable' }, data: null };
    if (name === 'sso_issuance_snapshot')
      return { data: { ...currentSnapshot, member, assigned }, error: null };
    if (name === 'account_mfa_verified_factor')
      return { data: factor, error: null };
    if (name === 'sso_create_transaction') {
      starterBinding = args.p_starter_binding_hash ?? null;
      return { data: { id: transactionId }, error: null };
    }
    if (name === 'sso_bind_transaction') {
      if (consumed) return { error: {}, data: null };
      if (starterBinding && starterBinding !== args.p_session_binding_hash) {
        consumed = true;
        events.push('failed');
        return { data: false, error: null };
      }
      starterBinding = args.p_session_binding_hash;
      return { data: true, error: null };
    }
    if (name === 'sso_record_consent') {
      if (consumed) return { error: {}, data: null };
      events.push(args.p_approved ? 'approved' : 'denied');
      if (!args.p_approved) consumed = true;
    }
    if (name === 'sso_consume_transaction') {
      if (consumed) return { error: {}, data: null };
      consumed = true;
      return { data: { subject: 'ab'.repeat(32) }, error: null };
    }
    if (name === 'sso_reject_transaction' || name === 'sso_append_audit') {
      consumed = true;
      events.push('failed');
    }
    if (name === 'sso_finalize_issuance') events.push('signed');
    return { data: randomUUID(), error: null };
  });
});
function samlForm(binding: 'redirect' | 'post' = 'redirect', xml?: string) {
  return f.form(
    xml ?? f.requestXml().replace(f.idp.ssoUrl, `${base}/sso`),
    binding
  );
}
async function browser() {
  const response = await start(
    new NextRequest(`${base}/sso?${samlForm()}`),
    context
  );
  expect(response.status).toBe(303);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw Error('missing cookie');
  const handle = new URL(
    response.headers.get('location') ?? ''
  ).searchParams.get('transaction');
  if (!handle) throw Error('missing handle');
  const value = cookie.slice(cookie.indexOf('=') + 1);
  const state = await unseal(value, handle, configuration());
  return { handle, state, cookie };
}
async function decide(
  input: Awaited<ReturnType<typeof browser>>,
  choice = 'approve',
  changes: Record<string, string> = {},
  actor = { userId: actorId, sessionId: 'session' }
) {
  return decision(
    new NextRequest(
      `${origin}api/v1/sso/transactions/${input.handle}/decision`,
      {
        method: 'POST',
        headers: {
          cookie: input.cookie,
          origin: new URL(origin).origin,
          'content-type': 'application/x-www-form-urlencoded',
          ...changes,
        },
        body: new URLSearchParams({
          decision: choice,
          csrf: csrfFor(input.state, actor),
          locale: 'en',
        }),
      }
    ),
    { params: Promise.resolve({ transactionId: input.handle }) }
  );
}
describe('disabled Web route exports', () => {
  it.each(['', 'false'])(
    'all endpoints deny flag=%s before any store access',
    async (flag) => {
      vi.stubEnv('SSO_SAML_ENABLED', flag);
      expect(
        (await metadata(new NextRequest(`${base}/metadata`), context)).status
      ).toBe(404);
      expect(
        (await start(new NextRequest(`${base}/sso`), context)).status
      ).toBe(404);
      expect(
        (
          await postStart(
            new NextRequest(`${base}/sso`, { method: 'POST' }),
            context
          )
        ).status
      ).toBe(404);
      expect(
        (
          await decision(new NextRequest(origin, { method: 'POST' }), {
            params: Promise.resolve({ transactionId: opaque() }),
          })
        ).status
      ).toBe(404);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );
});
describe('admission and metadata', () => {
  it('serves public certificate metadata without private key', async () => {
    const response = await metadata(
      new NextRequest(`${base}/metadata`),
      context
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('PRIVATE KEY');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects an unknown route client', async () => {
    expect(
      (
        await start(new NextRequest(`${base}/sso?${samlForm()}`), {
          params: Promise.resolve({ clientId: randomUUID() }),
        })
      ).status
    ).toBe(403);
  });
  it.each(['issuer', 'ACS'])(
    'rejects %s mismatch before reservation',
    async (kind) => {
      const xml = f
        .requestXml()
        .replace(f.idp.ssoUrl, `${base}/sso`)
        .replace(
          kind === 'issuer' ? f.profile.entityId : f.profile.acsUrl,
          kind === 'issuer' ? 'urn:unknown' : 'https://evil.example.test/acs'
        );
      expect(
        (
          await start(
            new NextRequest(`${base}/sso?${samlForm('redirect', xml)}`),
            context
          )
        ).status
      ).toBe(503);
      expect(
        mocks.rpc.mock.calls.some(([name]) => name === 'sso_create_transaction')
      ).toBe(false);
    }
  );
  it('admits cross-site POST without an ambient cookie and resumes via a secure host cookie', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError' },
    });
    const response = await postStart(
      new NextRequest(`${base}/sso`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: samlForm('post'),
      }),
      context
    );
    expect(response.status).toBe(303);
    const cookie = response.headers.get('set-cookie') ?? '';
    for (const attribute of [
      '__Host-sso-',
      'HttpOnly',
      'Secure',
      'SameSite=lax',
      'Path=/',
    ])
      expect(cookie).toContain(attribute);
  });
  it.each(['key', 'schema', 'rate store'])(
    'fails closed on missing %s',
    async (kind) => {
      if (kind === 'key') vi.stubEnv('SSO_SAML_SIGNING_KEY', '');
      if (kind === 'schema') failRpc = 'sso_issuance_snapshot';
      if (kind === 'rate store')
        mocks.limiter.mockResolvedValue({ allowed: false });
      expect(
        (await start(new NextRequest(`${base}/sso?${samlForm()}`), context))
          .status
      ).toBe(503);
    }
  );
});
describe('browser decisions and signed response', () => {
  it('posts a doubly signed response only to the registered ACS, accepted by Node-SAML', async () => {
    const b = await browser();
    const response = await decide(b);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`action="${f.profile.acsUrl}"`);
    const encoded = html.match(/name="SAMLResponse" value="([^"]+)"/)?.[1];
    if (!encoded) throw Error('no response');
    const spFixture = {
      ...f,
      idp: { ...f.idp, entityId: `${base}/metadata`, ssoUrl: `${base}/sso` },
    };
    const accepted = await (await serviceProvider(spFixture)).accept(
      Buffer.from(encoded, 'base64').toString()
    );
    expect(accepted.nameID).toBe('ab'.repeat(32));
    expect(events).toEqual(['approved', 'signed']);
    expect(response.headers.get('content-security-policy')).toContain(
      `form-action ${f.profile.acsUrl}`
    );
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect((await decide(b)).status).toBe(503);
  });
  it('denies with durable consent and no signed response', async () => {
    const response = await decide(await browser(), 'deny');
    expect(response.status).toBe(303);
    expect(events).toEqual(['denied']);
    expect(response.headers.get('location')).toContain('denied=1');
  });
  it.each([
    'unassigned',
    'guest',
    'removed member',
    'stale MFA',
    'removed factor',
    'recovery',
    'unconfirmed email',
    'audit outage',
  ])('denies %s', async (kind) => {
    const b = await browser();
    if (kind === 'unassigned') assigned = false;
    if (kind === 'guest' || kind === 'removed member') member = false;
    if (kind === 'stale MFA') mfaTime -= 601;
    if (kind === 'removed factor') factor = null;
    if (kind === 'recovery') {
      const user = (await mocks.getUserById()).data.user;
      mocks.getUserById.mockResolvedValue({
        data: {
          user: {
            ...user,
            app_metadata: {
              tuturuuu_required_mfa: {
                required: true,
                recoveryInProgress: true,
              },
            },
          },
        },
        error: null,
      });
    }
    if (kind === 'unconfirmed email') {
      const user = (await mocks.getUserById()).data.user;
      mocks.getUserById.mockResolvedValue({
        data: { user: { ...user, email_confirmed_at: null } },
      });
    }
    if (kind === 'audit outage') failRpc = 'sso_finalize_issuance';
    const response = await decide(b);
    const error =
      kind === 'audit outage'
        ? 'unavailable'
        : ['stale MFA', 'removed factor', 'recovery'].includes(kind)
          ? 'mfa_required'
          : 'forbidden';
    expect(response.status).toBe(kind === 'audit outage' ? 503 : 403);
    expect(await response.clone().json()).toEqual({ error: `sso_${error}` });
    if (['removed factor', 'recovery'].includes(kind)) {
      expect(
        mocks.rpc.mock.calls.some(([name]) =>
          [
            'sso_record_consent',
            'sso_consume_transaction',
            'sso_finalize_issuance',
          ].includes(name)
        )
      ).toBe(false);
    }
    expect(await response.text()).not.toContain('SAMLResponse');
    expect(events).not.toContain('signed');
  });
  it('rejects cross-origin decisions', async () => {
    expect(
      (
        await decide(await browser(), 'approve', {
          origin: 'https://evil.example.test',
        })
      ).status
    ).toBe(403);
  });
  async function consentPage(b: Awaited<ReturnType<typeof browser>>) {
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: b.cookie.slice(b.cookie.indexOf('=') + 1) }),
    });
    mocks.headers.mockResolvedValue(new Headers({ cookie: b.cookie }));
    return renderToStaticMarkup(
      await ConsentPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ transaction: b.handle }),
      })
    );
  }
  async function switchSession(userId: string, sessionId: string) {
    const user = { ...(await mocks.getUserById()).data.user, id: userId };
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
    const claims = {
      ...(await mocks.getClaims()).data.claims,
      sub: userId,
      session_id: sessionId,
    };
    mocks.getClaims.mockResolvedValue({ data: { claims }, error: null });
    return { userId, sessionId };
  }
  it('the otherwise-valid factor and recovery fixture renders consent and issues', async () => {
    const b = await browser();
    expect(await consentPage(b)).toContain('name="csrf"');
    expect((await decide(b)).status).toBe(200);
    expect(events).toEqual(['approved', 'signed']);
  });
  it.each(['other account', 'new session'])(
    'the switched %s can issue when starting a fresh SP transaction',
    async (kind) => {
      const actor = await switchSession(
        kind === 'other account' ? randomUUID() : actorId,
        'replacement'
      );
      const b = await browser();
      expect(await consentPage(b)).toContain('name="csrf"');
      expect((await decide(b, 'approve', {}, actor)).status).toBe(200);
      expect(events).toEqual(['approved', 'signed']);
    }
  );
  it.each(['other account', 'new session'])(
    'denies a reloaded consent page after switching to %s',
    async (kind) => {
      const b = await browser();
      expect(starterBinding).toBe(hash(`${actorId}:session`));
      // Switching before the first consent load must also preserve the starter.
      const actor = await switchSession(
        kind === 'other account' ? randomUUID() : actorId,
        'replacement'
      );
      expect(await consentPage(b)).toContain('denied');
      expect(await consentPage(b)).not.toContain('name="csrf"');
      expect(events).toEqual(['failed']);
      const response = await decide(b, 'approve', {}, actor);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'sso_unavailable' });
      expect(events).not.toContain('approved');
    }
  );
  it.each(['other account', 'new session'])(
    'denies a fresh decision token for %s without a page reload',
    async (kind) => {
      const b = await browser();
      expect(await consentPage(b)).toContain('name="csrf"');
      const actor = await switchSession(
        kind === 'other account' ? randomUUID() : actorId,
        'replacement'
      );
      const response = await decide(b, 'approve', {}, actor);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'sso_session_changed' });
      expect(events).toEqual(['failed']);
    }
  );
  it('binds a signed-out start to the first authenticated continuation', async () => {
    const user = (await mocks.getUser()).data.user;
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError' },
    });
    const b = await browser();
    expect(starterBinding).toBeNull();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await consentPage(b)).toContain('name="csrf"');
    expect(starterBinding).toBe(hash(`${actorId}:session`));
    expect((await decide(b)).status).toBe(200);
  });
  it('claims a signed-out transaction before asking its first authenticated viewer for MFA', async () => {
    const user = (await mocks.getUser()).data.user;
    const claims = (await mocks.getClaims()).data.claims;
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const b = await browser();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          ...claims,
          aal: 'aal1',
          amr: [{ method: 'password', timestamp: mfaTime - 1 }],
        },
      },
      error: null,
    });
    expect(await consentPage(b)).toContain('authentication_required');
    expect(starterBinding).toBe(hash(`${actorId}:session`));
    mocks.getClaims.mockResolvedValue({ data: { claims }, error: null });
    await switchSession(randomUUID(), 'another-session');
    expect(await consentPage(b)).toContain('denied');
    expect(events).toEqual(['failed']);
  });
  it('rejects missing browser binding', async () => {
    expect(
      (await decide(await browser(), 'approve', { cookie: '' })).status
    ).toBe(403);
  });
  it('rejects expired and swapped encrypted transaction state', async () => {
    const b = await browser();
    const state: BrowserState = {
      ...b.state,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    b.cookie = `${cookieName(b.handle)}=${await seal(state, configuration())}`;
    expect((await decide(b)).status).toBe(503);
    await expect(
      unseal(await seal(b.state, configuration()), opaque(), configuration())
    ).rejects.toThrow();
  });
});

describe('management assurance and persisted SP trust', () => {
  it('allows verified managers without external identity display names', async () => {
    const live = (await mocks.getUserById()).data.user;
    mocks.getUserById.mockResolvedValue({
      data: { user: { ...live, user_metadata: {} } },
      error: null,
    });
    await expect(
      managementPrincipal(new NextRequest(origin), await adminClient())
    ).resolves.toEqual({ userId: actorId, mfaAt: mfaTime });
  });
  it('denies a manager after removing the verified factor', async () => {
    factor = null;
    await expect(
      managementPrincipal(new NextRequest(origin), await adminClient())
    ).rejects.toMatchObject({ code: 'mfa_required' });
  });
  it('uses stored required signatures instead of the deployment unsigned policy', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ...row(),
        saml: {
          ...row().saml,
          request_signing_mode: 'required',
          sp_certificate: f.certificate,
        },
      },
      error: null,
    });
    const current = await snapshot(await adminClient(), configuration());
    expect(current.profile.requestSigning).toEqual({
      mode: 'required',
      certificate: f.certificate,
    });
  });
  it('uses explicitly stored unsigned policy with legacy deployment fallback intact', async () => {
    vi.stubEnv('SSO_SAML_REQUEST_SIGNING', 'required');
    vi.stubEnv('SSO_SAML_SP_CERTIFICATE', f.certificate);
    mocks.rpc.mockResolvedValue({
      data: {
        ...row(),
        saml: {
          ...row().saml,
          request_signing_mode: 'unsigned',
          sp_certificate: null,
        },
      },
      error: null,
    });
    expect(
      (await snapshot(await adminClient(), configuration())).profile
        .requestSigning
    ).toEqual({ mode: 'unsigned' });
    mocks.rpc.mockResolvedValue({ data: row(), error: null });
    expect(
      (await snapshot(await adminClient(), configuration())).profile
        .requestSigning
    ).toEqual({ mode: 'required', certificate: f.certificate });
  });
  it('fails closed on a required stored signature policy without a valid certificate', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ...row(),
        saml: {
          ...row().saml,
          request_signing_mode: 'required',
          sp_certificate: null,
        },
      },
      error: null,
    });
    await expect(
      snapshot(await adminClient(), configuration())
    ).rejects.toThrow();
  });
});
