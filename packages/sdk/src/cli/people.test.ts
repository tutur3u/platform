import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import { getHelpOutput } from './help';
import { maskDisplay, readSensitiveValue } from './people-input';
import { peopleHelp, runPeopleCommand } from './people';

const { secret } = vi.hoisted(() => ({ secret: vi.fn() }));
vi.mock('./people-input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./people-input')>()),
  readSensitiveValue: secret,
}));

const WS = '2e627dd0-3b4b-472e-b6de-3fb4b767a775';
const PERSON = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';
const IDENTITY = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const base = `https://tuturuuu.com/api/v1/workspaces/${WS}/people-registry`;

const person = {
  id: PERSON,
  status: 'active',
  version: 3,
  kind: 'person',
  label: 'Lan',
  identities: [
    {
      id: IDENTITY,
      channel: 'zalo',
      providerAccountId: 'acct-1',
      verification: 'asserted',
      linkState: 'confirmed',
      basis: 'owner_statement',
      keyVersion: 1,
      displayValue: '+84900001234',
      decidedAt: null,
      createdAt: '2026-11-21T00:00:00.000Z',
    },
  ],
  facts: [{ key: 'preferred_name', value: 'chị Lan', revision: 2 }],
};

function fixture(json = false, reply: unknown = { reason: 'updated' }) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if ((init?.method ?? 'GET') !== 'GET') return Response.json(reply);
      if (url.includes(`/persons/${PERSON}`)) return Response.json(person);
      if (url.includes('/persons'))
        return Response.json({
          persons: [
            {
              id: PERSON,
              kind: 'person',
              label: 'Lan',
              status: 'active',
              isOwner: false,
              version: 3,
              updatedAt: '2026-11-21T00:00:00.000Z',
              identityCount: 1,
            },
          ],
        });
      return Response.json({
        isOwner: true,
        captureEnabled: false,
        personalSessionsEnabled: false,
        stopped: false,
        generation: 4,
      });
    });
  const client = new TuturuuuUserClient({
    accessToken: 'test-only-token',
    baseUrl: 'https://tuturuuu.com',
    fetch,
  });
  const output = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const run = (
    positionals: string[],
    flags: Record<string, string | boolean> = {}
  ) => runPeopleCommand({ client, flags, json, positionals, workspaceId: WS });
  const call = (index: number) => {
    const [input, init] = fetch.mock.calls[index] ?? [];
    return {
      method: init?.method ?? 'GET',
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    };
  };
  const printed = () =>
    output.mock.calls.map(([text]) => String(text)).join('');
  return { call, fetch, printed, run };
}

afterEach(() => {
  vi.restoreAllMocks();
  secret.mockReset();
});

describe('ttr people', () => {
  it('lists and searches through the authenticated manager routes', async () => {
    const { call, printed, run } = fixture();
    await run(['ls'], { limit: '10' });
    await run(['search', 'Lan']);
    expect(call(0)).toMatchObject({
      method: 'GET',
      url: `${base}/persons?limit=10`,
      auth: 'Bearer test-only-token',
    });
    expect(call(1).url).toBe(`${base}/persons?q=Lan`);
    expect(printed()).toContain(`${PERSON}  Lan  person  active  ids:1`);
  });

  it('shows a person with display values masked', async () => {
    const { printed, run } = fixture();
    await run(['show', PERSON]);
    expect(printed()).toContain('********234');
    expect(printed()).not.toContain('+84900001234');
    expect(printed()).toContain('fact preferred_name = chị Lan  rev 2');
  });

  it('reads the external ID for link from the hidden input, never argv', async () => {
    secret.mockResolvedValue('+84900005678');
    const { call, run } = fixture(false, { reason: 'proposed' });
    await run(['link', PERSON], { channel: 'whatsapp', account: 'acct-1' });
    expect(secret).toHaveBeenCalledTimes(1);
    expect(call(0)).toMatchObject({
      method: 'POST',
      url: `${base}/persons/${PERSON}/identities`,
      body: {
        channel: 'whatsapp',
        account: 'acct-1',
        externalId: '+84900005678',
        basis: 'owner_statement',
      },
    });
  });

  it('confirms identities and writes revision-checked facts, rules and consent', async () => {
    const { call, run } = fixture();
    await run(['confirm', PERSON, IDENTITY]);
    await run(['fact', 'set', PERSON, 'language', 'vi'], { rev: '2' });
    await run(['fact', 'rm', PERSON, 'language'], { rev: '3' });
    await run(['rules', 'set', 'person', 'reply_mode', '"draft_for_owner"'], {
      person: PERSON,
    });
    await run(['consent', 'set', PERSON, 'profile', 'granted'], {
      basis: 'owner_attested',
      note: 'agreed in person',
    });
    await run(['relate', PERSON, 'colleague', IDENTITY]);
    expect(call(0)).toMatchObject({
      method: 'PATCH',
      body: { identityId: IDENTITY, state: 'confirmed' },
    });
    expect(call(1).body).toEqual({
      key: 'language',
      value: 'vi',
      baseRevision: 2,
      remove: false,
    });
    expect(call(2).body).toEqual({
      key: 'language',
      baseRevision: 3,
      remove: true,
    });
    expect(call(3)).toMatchObject({
      method: 'PUT',
      url: `${base}/persons/${PERSON}/rules`,
      body: {
        scope: 'person',
        rule: 'reply_mode',
        value: 'draft_for_owner',
        baseRevision: null,
      },
    });
    expect(call(4).body).toEqual({
      store: 'profile',
      state: 'granted',
      basis: 'owner_attested',
      evidence: { note: 'agreed in person' },
    });
    expect(call(5).body).toMatchObject({
      otherPersonId: IDENTITY,
      kind: 'colleague',
    });
  });

  it('surfaces refusals with their status and code', async () => {
    const { fetch, run } = fixture();
    fetch.mockResolvedValueOnce(
      Response.json({ error: 'forbidden' }, { status: 403 })
    );
    await expect(run(['flags'], { capture: 'on' })).rejects.toThrow(
      'People registry refused (403): forbidden'
    );
    await expect(
      run(['fact', 'set', PERSON, 'k', 'v'], { rev: '0' })
    ).rejects.toThrow('--rev must be');
    await expect(run(['nope'])).rejects.toThrow('Unknown people command');
  });

  it('prints JSON and routes help', async () => {
    const { printed, run } = fixture(true);
    await run(['status']);
    expect(JSON.parse(printed()).generation).toBe(4);
    expect(getHelpOutput('people')).toBe(peopleHelp());
    expect(getHelpOutput()).toContain('people <ls|search|show');
  });
});

describe('people input', () => {
  it('masks short and long display values', () => {
    expect(maskDisplay(null)).toBe('-');
    expect(maskDisplay('abc')).toBe('***');
    expect(maskDisplay('+84900001234')).toBe('********234');
  });

  it('reads piped input without echoing it', async () => {
    const actual =
      await vi.importActual<typeof import('./people-input')>('./people-input');
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    const reading = actual.readSensitiveValue('prompt: ', stdin);
    (stdin as unknown as PassThrough).end('  +84900009999\n');
    await expect(reading).resolves.toBe('+84900009999');
    expect(readSensitiveValue).toBe(secret);
  });
});
