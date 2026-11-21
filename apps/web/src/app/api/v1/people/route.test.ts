import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PEOPLE_EVENT_DOMAIN } from '@/lib/people-registry/ingress-event';
import {
  lookupHash,
  newWorkspaceKeys,
  suppressionToken,
  unwrapWorkspaceKey,
  wrapWorkspaceKey,
} from '@/lib/people-registry/keys';
import {
  canonicalRequestBytes,
  sha256Hex,
} from '@/lib/people-registry/request-signature';
import { GET as getChanges } from './changes/route';
import { POST as writeEvent } from './events/route';
import { POST as recall } from './recall/route';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({
    schema: (name: string) => {
      expect(name).toBe('private');
      return { rpc };
    },
  }),
}));

const principalId = '11111111-1111-4111-8111-111111111111';
const wsId = '22222222-2222-4222-8222-222222222222';
const kid = 'responder-key-1';
const principal = generateKeyPairSync('ed25519');
const ingress = generateKeyPairSync('ed25519');
const raw = (key: typeof principal.publicKey) =>
  key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');

function signedRequest(
  path: string,
  options: {
    method?: string;
    body?: string;
    event?: Record<string, unknown> | null;
  } = {}
) {
  const method = options.method ?? 'POST';
  const body = options.body ?? '';
  const bytes = new TextEncoder().encode(body);
  const nonce = randomBytes(16).toString('base64url');
  const timestamp = Date.now();
  const headers = new Headers({
    'content-type': 'application/json',
    'x-people-principal': principalId,
    'x-people-key-id': kid,
    'x-people-timestamp': String(timestamp),
    'x-people-nonce': nonce,
    'x-people-signature': sign(
      null,
      canonicalRequestBytes({
        method,
        path,
        bodySha256: sha256Hex(bytes),
        principalId,
        kid,
        timestamp,
        nonce,
      }),
      principal.privateKey
    ).toString('base64url'),
  });
  if (options.event !== null) {
    const proof = Buffer.from(
      JSON.stringify({
        version: 1,
        kid: 'mira-1',
        channel: 'zalo',
        account: 'acct-1',
        sender: 'sender-1',
        conversation: 'conv-1',
        conversationType: 'group',
        eventId: 'evt-1',
        operation: 'registry.recall',
        inputSha256: createHash('sha256').update(bytes).digest('hex'),
        issuedAt: Date.now(),
        ...options.event,
      })
    ).toString('base64url');
    headers.set('x-people-event-key-id', 'mira-1');
    headers.set('x-people-event', proof);
    headers.set(
      'x-people-event-signature',
      sign(
        null,
        Buffer.from(`${PEOPLE_EVENT_DOMAIN}.${proof}`),
        ingress.privateKey
      ).toString('base64url')
    );
  }
  return new NextRequest(`https://tuturuuu.com${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : body,
  });
}

function principalRow(kind = 'responder') {
  return {
    principalId,
    wsId,
    kind,
    generation: 2,
    publicKey: raw(principal.publicKey),
  };
}

function registry(
  kind: string,
  handlers: Record<string, (args: Record<string, unknown>) => unknown>
) {
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'people_principal_key')
      return { data: principalRow(kind), error: null };
    if (fn === 'people_admit_request')
      return {
        data: { reason: 'admitted', wsId, kind, principalId },
        error: null,
      };
    const handler = handlers[fn];
    if (!handler) throw new Error(`unexpected rpc ${fn}`);
    return { data: handler(args), error: null };
  });
}

describe('people registry machine routes', () => {
  let keys: ReturnType<typeof newWorkspaceKeys>;

  beforeEach(() => {
    process.env.PEOPLE_REGISTRY_WRAP_KID = '1a2b3c4d';
    process.env.PEOPLE_REGISTRY_WRAP_KEY_1a2b3c4d =
      randomBytes(32).toString('hex');
    process.env.MIRA_INGRESS_PUBLIC_KEYS = JSON.stringify({
      'mira-1': raw(ingress.publicKey),
    });
    keys = newWorkspaceKeys(wsId);
    rpc.mockReset();
  });

  afterEach(() => {
    delete process.env.MIRA_INGRESS_PUBLIC_KEYS;
  });

  const lookupKeys = () => [
    {
      purpose: 'sender_lookup',
      version: 1,
      wrappedKey: keys.sender_lookup,
      current: true,
    },
    {
      purpose: 'conversation_lookup',
      version: 1,
      wrappedKey: keys.conversation_lookup,
      current: true,
    },
  ];

  it('recalls with lookup hashes derived from the evidence', async () => {
    let recallArgs: Record<string, unknown> = {};
    registry('responder', {
      people_machine_lookup_keys: (args) => {
        expect(args).toEqual({ p_ws: wsId, p_principal: principalId });
        return lookupKeys();
      },
      people_recall: (args) => {
        recallArgs = args;
        return {
          reason: 'ok',
          personId: 'person-1',
          conversationId: 'conv-row-1',
          versions: { generation: 1 },
          etag: 'e'.repeat(64),
          snapshot: { facts: [] },
        };
      },
    });
    const response = await recall(
      signedRequest('/api/v1/people/recall', { body: '{}' })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      person_id: 'person-1',
      conversation_id: 'conv-row-1',
      versions: { generation: 1 },
      etag: 'e'.repeat(64),
      snapshot: { facts: [] },
      memories: [],
    });
    const sender = lookupHash(
      unwrapWorkspaceKey(
        wsId,
        lookupKeys()[0] as Parameters<typeof unwrapWorkspaceKey>[1]
      ),
      { wsId, channel: 'zalo', account: 'acct-1', externalId: 'sender-1' }
    ).toString('hex');
    expect(recallArgs).toMatchObject({
      p_ws: wsId,
      p_principal: principalId,
      p_event: {
        channel: 'zalo',
        account: 'acct-1',
        eventHash: createHash('sha256').update('evt-1').digest('hex'),
      },
      p_conversation_type: 'group',
      p_sender_lookups: [{ version: 1, hash: sender }],
      p_if_version: null,
    });
    expect(JSON.stringify(recallArgs)).not.toContain('sender-1');
  });

  it('returns not_modified without a snapshot', async () => {
    registry('responder', {
      people_machine_lookup_keys: lookupKeys,
      people_recall: (args) => {
        expect(args.p_if_version).toBe('a'.repeat(64));
        return {
          reason: 'ok',
          personId: null,
          conversationId: null,
          versions: {},
          etag: 'a'.repeat(64),
          notModified: true,
        };
      },
    });
    const body = JSON.stringify({ if_version: 'a'.repeat(64) });
    const response = await recall(
      signedRequest('/api/v1/people/recall', { body })
    );
    const json = await response.json();
    expect(json.not_modified).toBe(true);
    expect(json).not.toHaveProperty('snapshot');
  });

  it.each([
    ['scope_denied', 403],
    ['event_consumed', 409],
    ['principal_refused', 403],
  ])('maps a %s recall to %i', async (reason, status) => {
    registry('responder', {
      people_machine_lookup_keys: lookupKeys,
      people_recall: () => ({ reason }),
    });
    const response = await recall(
      signedRequest('/api/v1/people/recall', { body: '{}' })
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: reason });
  });

  it('refuses missing or Fleet evidence before any key is loaded', async () => {
    registry('responder', {});
    for (const request of [
      signedRequest('/api/v1/people/recall', { body: '{}', event: null }),
      signedRequest('/api/v1/people/recall', {
        body: '{}',
        event: { operation: 'registry.write' },
      }),
    ]) {
      const response = await recall(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'evidence_refused' });
    }
    expect(rpc.mock.calls.map(([fn]) => fn)).not.toContain(
      'people_machine_lookup_keys'
    );
  });

  it('refuses unknown fields and unsigned requests', async () => {
    registry('responder', {});
    const unknown = await recall(
      signedRequest('/api/v1/people/recall', { body: '{"query":"x"}' })
    );
    expect(unknown.status).toBe(400);
    const unsigned = await recall(
      new NextRequest('https://tuturuuu.com/api/v1/people/recall', {
        method: 'POST',
        body: '{}',
      })
    );
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toEqual({ error: 'unsigned' });
  });

  it('serves the change feed to drain principals with a bounded cursor', async () => {
    registry('drain', {
      people_list_changes: (args) => {
        expect(args).toEqual({
          p_ws: wsId,
          p_principal: principalId,
          p_after: '41',
          p_limit: 50,
        });
        return { reason: 'ok', events: [], next: 41 };
      },
    });
    const response = await getChanges(
      signedRequest('/api/v1/people/changes?after=41&limit=50', {
        method: 'GET',
        event: null,
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events: [], next: 41 });
    registry('drain', {});
    const invalid = await getChanges(
      signedRequest('/api/v1/people/changes?limit=900', {
        method: 'GET',
        event: null,
      })
    );
    expect(invalid.status).toBe(400);
  });

  const observe = JSON.stringify({ items: [{ type: 'observe_sender' }] });
  const writeEvidence = { operation: 'registry.write' };

  it('writes a bundle with the current conversation hash and the body hash', async () => {
    let writeArgs: Record<string, unknown> = {};
    registry('responder', {
      people_machine_lookup_keys: lookupKeys,
      people_write_event: (args) => {
        writeArgs = args;
        return {
          reason: 'ok',
          items: [{ type: 'observe_sender', result: 'created' }],
        };
      },
    });
    const response = await writeEvent(
      signedRequest('/api/v1/people/events', {
        body: observe,
        event: writeEvidence,
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ type: 'observe_sender', result: 'created' }],
    });
    const conversation = lookupHash(
      unwrapWorkspaceKey(
        wsId,
        lookupKeys()[1] as Parameters<typeof unwrapWorkspaceKey>[1]
      ),
      { wsId, channel: 'zalo', account: 'acct-1', externalId: 'conv-1' }
    ).toString('hex');
    expect(writeArgs).toMatchObject({
      p_input_sha256: createHash('sha256').update(observe).digest('hex'),
      p_conversation_current: { version: 1, hash: conversation },
      p_conversation_lookups: [{ version: 1, hash: conversation }],
      p_items: [{ type: 'observe_sender' }],
    });
    expect(JSON.stringify(writeArgs)).not.toContain('conv-1');
  });

  it.each([
    ['unknown_sender', 422],
    ['consent_required', 422],
    ['event_consumed', 409],
    ['scope_denied', 403],
  ])('maps a %s receipt to %i', async (reason, status) => {
    registry('responder', {
      people_machine_lookup_keys: lookupKeys,
      people_write_event: () => ({ reason }),
    });
    const response = await writeEvent(
      signedRequest('/api/v1/people/events', {
        body: observe,
        event: writeEvidence,
      })
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: reason });
  });

  it('marks a replayed receipt', async () => {
    registry('responder', {
      people_machine_lookup_keys: lookupKeys,
      people_write_event: () => ({
        reason: 'ok',
        items: [{ type: 'observe_sender', result: 'created' }],
        replayed: true,
      }),
    });
    const response = await writeEvent(
      signedRequest('/api/v1/people/events', {
        body: observe,
        event: writeEvidence,
      })
    );
    expect((await response.json()).replayed).toBe(true);
  });

  it('refuses recall evidence, unknown items and memories on the write route', async () => {
    registry('responder', {});
    const recallEvidence = await writeEvent(
      signedRequest('/api/v1/people/events', { body: observe })
    );
    expect(recallEvidence.status).toBe(401);
    for (const body of [
      JSON.stringify({ items: [{ type: 'propose_sender' }] }),
      JSON.stringify({ items: [], memories: [] }),
    ]) {
      const response = await writeEvent(
        signedRequest('/api/v1/people/events', { body, event: writeEvidence })
      );
      expect(response.status).toBe(400);
    }
    expect(rpc.mock.calls.map(([fn]) => fn)).not.toContain(
      'people_write_event'
    );
  });

  const captureKeys = () => [
    {
      purpose: 'display',
      version: 1,
      wrappedKey: keys.display,
      current: true,
    },
    {
      purpose: 'suppression',
      version: 1,
      wrappedKey: keys.suppression,
      current: true,
    },
  ];

  it('derives capture material for a labelled observation while capture is on', async () => {
    let item: Record<string, unknown> = {};
    registry('responder', {
      people_machine_lookup_keys: lookupKeys,
      people_machine_capture_keys: captureKeys,
      people_write_event: (args) => {
        item = (args.p_items as Record<string, unknown>[])[0] ?? {};
        return {
          reason: 'ok',
          items: [{ type: 'observe_sender', result: 'proposed' }],
        };
      },
    });
    const body = JSON.stringify({
      items: [{ type: 'observe_sender', label: 'Hoa' }],
    });
    const response = await writeEvent(
      signedRequest('/api/v1/people/events', { body, event: writeEvidence })
    );
    expect(response.status).toBe(200);
    const sender = lookupHash(
      unwrapWorkspaceKey(
        wsId,
        lookupKeys()[0] as Parameters<typeof unwrapWorkspaceKey>[1]
      ),
      { wsId, channel: 'zalo', account: 'acct-1', externalId: 'sender-1' }
    );
    const capture = item.capture as {
      personId: string;
      lookup: unknown;
      suppression: { version: number; token: string };
      checks: string[];
      display: string;
    };
    expect(item).toMatchObject({ type: 'observe_sender', label: 'Hoa' });
    expect(capture.personId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(capture.lookup).toEqual({
      version: 1,
      hash: sender.toString('hex'),
    });
    expect(capture.suppression.token).toBe(
      suppressionToken(
        unwrapWorkspaceKey(
          wsId,
          captureKeys()[1] as Parameters<typeof unwrapWorkspaceKey>[1]
        ),
        wsId,
        sender
      ).toString('hex')
    );
    expect(capture.checks).toContain(capture.suppression.token);
    expect(capture.display).toMatch(/^([0-9a-f]{2})+$/);
    expect(JSON.stringify(item)).not.toContain('sender-1');
  });

  it('sends no capture material while capture is off or without a label', async () => {
    const items: Record<string, unknown>[] = [];
    registry('responder', {
      people_machine_lookup_keys: lookupKeys,
      people_machine_capture_keys: () => [],
      people_write_event: (args) => {
        items.push((args.p_items as Record<string, unknown>[])[0] ?? {});
        return { reason: 'unknown_sender' };
      },
    });
    for (const body of [
      JSON.stringify({ items: [{ type: 'observe_sender', label: 'Hoa' }] }),
      observe,
    ]) {
      const response = await writeEvent(
        signedRequest('/api/v1/people/events', { body, event: writeEvidence })
      );
      expect(response.status).toBe(422);
    }
    expect(items.every((entry) => !('capture' in entry))).toBe(true);
    expect(
      rpc.mock.calls.filter(([fn]) => fn === 'people_machine_capture_keys')
    ).toHaveLength(1);
  });

  it('covers every lookup and suppression version in the capture checks', async () => {
    const rotated = (purpose: 'sender_lookup' | 'suppression') =>
      wrapWorkspaceKey(wsId, purpose, 2, randomBytes(32));
    const lookups = [
      { ...lookupKeys()[0], current: false },
      {
        purpose: 'sender_lookup',
        version: 2,
        wrappedKey: rotated('sender_lookup'),
        current: true,
      },
      lookupKeys()[1],
    ];
    const capture = [
      captureKeys()[0],
      { ...captureKeys()[1], current: false },
      {
        purpose: 'suppression',
        version: 2,
        wrappedKey: rotated('suppression'),
        current: true,
      },
    ];
    let item: Record<string, unknown> = {};
    registry('responder', {
      people_machine_lookup_keys: () => lookups,
      people_machine_capture_keys: () => capture,
      people_write_event: (args) => {
        item = (args.p_items as Record<string, unknown>[])[0] ?? {};
        return { reason: 'ok', items: [] };
      },
    });
    await writeEvent(
      signedRequest('/api/v1/people/events', {
        body: JSON.stringify({
          items: [{ type: 'observe_sender', label: 'Hoa' }],
        }),
        event: writeEvidence,
      })
    );
    const unwrap = (key: unknown) =>
      unwrapWorkspaceKey(wsId, key as Parameters<typeof unwrapWorkspaceKey>[1]);
    const senderHashes = lookups
      .filter((key) => key?.purpose === 'sender_lookup')
      .map((key) =>
        lookupHash(unwrap(key), {
          wsId,
          channel: 'zalo',
          account: 'acct-1',
          externalId: 'sender-1',
        })
      );
    const expected = senderHashes.flatMap((hash) =>
      capture
        .filter((key) => key?.purpose === 'suppression')
        .map((key) => suppressionToken(unwrap(key), wsId, hash).toString('hex'))
    );
    const material = item.capture as {
      lookup: { version: number };
      suppression: { version: number; token: string };
      checks: string[];
    };
    expect(material.lookup.version).toBe(2);
    expect(material.suppression.version).toBe(2);
    expect(material.checks).toHaveLength(4);
    expect([...material.checks].sort()).toEqual([...expected].sort());
    expect(material.checks).toContain(material.suppression.token);
  });
});
