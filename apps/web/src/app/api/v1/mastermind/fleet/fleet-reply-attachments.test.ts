import {
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomUUID,
} from 'node:crypto';
import {
  ATTACHMENT_LIMITS,
  type AttachmentRecord,
  BRIDGE_CREDENTIAL_KEY_INFO,
  BRIDGE_FETCH_KEY_INFO,
  BRIDGE_SEAL_KEY_INFO_V2,
  bridgeFetchString,
  bridgeReplyV2EnvelopeSchema,
  bridgeReplyV2SealContext,
  bridgeReplyV2SigningString,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'fleet-test-'.padEnd(44, 'f');
const THREAD = 'thread:project:mcp%3Aabc:1234';
const NOW_S = () => Math.floor(Date.now() / 1000);
const derive = (info: string) =>
  Buffer.from(hkdfSync('sha256', SECRET, Buffer.alloc(0), info, 32));
const credential = (sessionId: string) =>
  createHmac('sha256', derive(BRIDGE_CREDENTIAL_KEY_INFO))
    .update(sessionId)
    .digest('hex');

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  account: null as unknown,
  granted: [] as string[],
  bridge: null as Record<string, ReturnType<typeof vi.fn>> | null,
  records: new Map<string, unknown>(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (r: Request, a: unknown, p: unknown) => Response) =>
    async (request: Request, context?: { params?: unknown }) =>
      handler(
        request,
        {
          user: mocks.user,
          supabase: {
            auth: {
              getClaims: async () => ({ data: null, error: new Error('no') }),
            },
          },
        },
        await context?.params
      ),
}));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: () => Promise.resolve(mocks.account),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
  getBearerAccessToken: () => null,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: (p: string) => mocks.granted.includes(p),
  }),
}));
vi.mock(
  '@tuturuuu/utils/mastermind-store/bridge-client',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/utils/mastermind-store/bridge-client')
    >()),
    configuredMastermindBridge: () => mocks.bridge,
  })
);

const allowed = (sessionId = 'session-1') => ({
  status: 'allowed',
  userId: OWNER,
  proof: { sessionId, verifiedAt: NOW_S() - 60 },
});

function record(over: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: randomUUID(),
    actorId: OWNER,
    credential: credential('session-1'),
    machineId: 'skr-m4',
    threadId: THREAD,
    replyId: randomUUID(),
    kind: 'text',
    size: 5,
    state: 'reserved',
    meta: { iv: 'i'.repeat(16), data: 'd'.repeat(40) },
    createdAt: Date.now() - 1000,
    expiresAt: Date.now() + ATTACHMENT_LIMITS.reserveTtlMs,
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
  vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
  vi.stubEnv('MASTERMIND_REPLY_ATTACHMENTS_ENABLED', 'true');
  mocks.user = { id: OWNER };
  mocks.granted = ['manage_mastermind', 'view_infrastructure'];
  mocks.account = allowed();
  mocks.records = new Map();
  mocks.bridge = {
    socketUrl: 'wss://store.example/v1/bridge/connect' as never,
    live: vi.fn(async () => ({
      machines: [{ machineId: 'skr-m4', connected: true, attachments: true }],
      pokes: [],
    })),
    reserveAttachment: vi.fn(async () => ({
      id: randomUUID(),
      expiresAt: Date.now() + 60_000,
    })),
    attachmentRecords: vi.fn(async (ids: string[]) =>
      ids.map((id) => mocks.records.get(id) ?? null)
    ),
    finalizeAttachment: vi.fn(
      async (id: string, _f: unknown, bytes: Uint8Array) =>
        record({ id, state: 'ready', size: bytes.byteLength })
    ),
    sendV2: vi.fn(async (input: { envelope: { id: string } }) => ({
      receipt: {
        id: input.envelope.id,
        machineId: 'skr-m4',
        threadId: THREAD,
        state: 'sent',
        createdAt: Date.now(),
        textDigest: 'a'.repeat(64),
      },
      replayed: false,
    })),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const params = (value: Record<string, string> = {}) =>
  ({ params: Promise.resolve(value) }) as never;

function reserveRequest(body: Record<string, unknown> = {}) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/mastermind/fleet/reply-attachments',
    {
      method: 'POST',
      body: JSON.stringify({
        machineId: 'skr-m4',
        threadId: THREAD,
        replyId: randomUUID(),
        kind: 'image',
        name: '../../etc/screen‮shot.png',
        size: 1000,
        ...body,
      }),
    }
  );
}

function uploadRequest(id: string, bytes: Uint8Array, length?: number) {
  return new NextRequest(
    `https://tuturuuu.com/api/v1/mastermind/fleet/reply-attachments/${id}`,
    {
      method: 'PUT',
      headers: { 'content-length': String(length ?? bytes.byteLength) },
      body: bytes as unknown as BodyInit,
    }
  );
}

const reserveRoute = () => import('./reply-attachments/route');
const uploadRoute = () => import('./reply-attachments/[uploadId]/route');
const repliesRoute = () => import('./replies/route');

describe('reply attachments behind the flag', () => {
  it('answers 404 everywhere while the flag is off', async () => {
    vi.stubEnv('MASTERMIND_REPLY_ATTACHMENTS_ENABLED', '');
    const id = randomUUID();
    expect(
      (await (await reserveRoute()).POST(reserveRequest(), params())).status
    ).toBe(404);
    expect(
      (
        await (
          await uploadRoute()
        ).PUT(uploadRequest(id, new Uint8Array(3)), params({ uploadId: id }))
      ).status
    ).toBe(404);
    const reply = new NextRequest(
      'https://tuturuuu.com/api/v1/mastermind/fleet/replies',
      {
        method: 'POST',
        headers: { 'idempotency-key': randomUUID() },
        body: JSON.stringify({
          machineId: 'skr-m4',
          threadId: THREAD,
          text: '',
          attachments: [id],
        }),
      }
    );
    expect((await (await repliesRoute()).POST(reply, params())).status).toBe(
      404
    );
    expect(mocks.bridge!.reserveAttachment).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/mastermind/fleet/reply-attachments', () => {
  it('reserves for the owner, bound to the session, with a sealed, sanitized name', async () => {
    const { POST } = await reserveRoute();
    const response = await POST(reserveRequest(), params());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe('etcscreenshot.webp');
    const input = mocks.bridge!.reserveAttachment!.mock.calls[0]![0];
    expect(input).toMatchObject({
      actorId: OWNER,
      credential: credential('session-1'),
      machineId: 'skr-m4',
      threadId: THREAD,
      kind: 'image',
      size: 1000,
    });
    // The store never sees the name in the clear.
    expect(JSON.stringify(input)).not.toContain('screen');
  });

  it('refuses linked machines, bridges without attachments and oversize files', async () => {
    const { POST } = await reserveRoute();
    expect(
      (await POST(reserveRequest({ environmentId: 'env-2' }), params())).status
    ).toBe(422);
    expect(
      (
        await POST(
          reserveRequest({ size: ATTACHMENT_LIMITS.maxFileBytes + 1 }),
          params()
        )
      ).status
    ).toBe(413);
    mocks.bridge!.live!.mockResolvedValueOnce({
      machines: [{ machineId: 'skr-m4', connected: true }],
      pokes: [],
    });
    const unsupported = await POST(reserveRequest(), params());
    expect(unsupported.status).toBe(409);
    expect(await unsupported.json()).toEqual({
      error: 'attachments_unsupported',
    });
    mocks.account = { status: 'required', userId: OWNER };
    expect((await POST(reserveRequest(), params())).status).toBe(401);
    expect(mocks.bridge!.reserveAttachment).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/mastermind/fleet/reply-attachments/[uploadId]', () => {
  it('enforces the reserved size at ingress before reading or storing anything', async () => {
    const { PUT } = await uploadRoute();
    const reserved = record({ size: 5 });
    mocks.records.set(reserved.id, reserved);
    const over = await PUT(
      uploadRequest(
        reserved.id,
        new Uint8Array(1),
        ATTACHMENT_LIMITS.maxFileBytes + 1
      ),
      params({ uploadId: reserved.id })
    );
    expect(over.status).toBe(413);
    const mismatch = await PUT(
      uploadRequest(reserved.id, new TextEncoder().encode('hello!')),
      params({ uploadId: reserved.id })
    );
    expect(mismatch.status).toBe(422);
    expect(mocks.bridge!.finalizeAttachment).not.toHaveBeenCalled();
  });

  it('refuses another session, a spent record and invalid text as not found or unsupported', async () => {
    const { PUT } = await uploadRoute();
    const reserved = record({ size: 5 });
    mocks.records.set(reserved.id, reserved);
    mocks.account = allowed('session-2');
    expect(
      (
        await PUT(
          uploadRequest(reserved.id, new TextEncoder().encode('hello')),
          params({ uploadId: reserved.id })
        )
      ).status
    ).toBe(404);
    mocks.account = allowed();
    mocks.records.set(reserved.id, { ...reserved, state: 'ready' });
    expect(
      (
        await PUT(
          uploadRequest(reserved.id, new TextEncoder().encode('hello')),
          params({ uploadId: reserved.id })
        )
      ).status
    ).toBe(404);
    mocks.records.set(reserved.id, reserved);
    const binary = await PUT(
      uploadRequest(reserved.id, new Uint8Array([104, 0, 255, 254, 1])),
      params({ uploadId: reserved.id })
    );
    expect(binary.status).toBe(415);
    expect(mocks.bridge!.finalizeAttachment).not.toHaveBeenCalled();
  });

  it('stores only re-encoded image bytes, never the upload, and refuses non-raster input', async () => {
    const { PUT } = await uploadRoute();
    const png = new Uint8Array(
      await sharp({
        create: {
          width: 3000,
          height: 1000,
          channels: 3,
          background: '#336699',
        },
      })
        .png()
        .withMetadata({ exif: { IFD0: { Copyright: 'secret-exif' } } })
        .toBuffer()
    );
    const reserved = record({ kind: 'image', size: png.byteLength });
    mocks.records.set(reserved.id, reserved);
    const response = await PUT(
      uploadRequest(reserved.id, png),
      params({ uploadId: reserved.id })
    );
    expect(response.status).toBe(200);
    const [, fields, stored] = mocks.bridge!.finalizeAttachment!.mock.calls[0]!;
    expect(fields).toMatchObject({
      mime: 'image/webp',
      credential: credential('session-1'),
    });
    const meta = await sharp(Buffer.from(stored)).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 2048 });
    expect(meta.exif).toBeUndefined();

    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"/>'
    );
    const other = record({ kind: 'image', size: svg.byteLength });
    mocks.records.set(other.id, other);
    expect(
      (await PUT(uploadRequest(other.id, svg), params({ uploadId: other.id })))
        .status
    ).toBe(415);
    const broken = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const third = record({ kind: 'image', size: broken.byteLength });
    mocks.records.set(third.id, third);
    expect(
      (
        await PUT(
          uploadRequest(third.id, broken),
          params({ uploadId: third.id })
        )
      ).status
    ).toBe(422);
  });
});

describe('POST /api/v1/mastermind/fleet/replies with attachments', () => {
  /** A finalized text record of reply `replyId`, with its name sealed as Web seals it. */
  async function finalized(
    replyId: string,
    over: Partial<AttachmentRecord> = {}
  ) {
    const { sealAttachmentName } =
      await import('@/lib/mastermind/fleet/reply-attachments');
    const value = record({
      replyId,
      state: 'ready',
      sha256: createHash('sha256').update(randomUUID()).digest('hex'),
      mime: 'text/plain',
      finalizedAt: Date.now() - 500,
      expiresAt: Date.now() + ATTACHMENT_LIMITS.recordTtlMs,
      meta: sealAttachmentName(
        SECRET,
        { replyId, machineId: 'skr-m4' },
        'notes.txt'
      ),
      ...over,
    });
    mocks.records.set(value.id, value);
    return value;
  }

  const send = async (
    replyId: string,
    ids: string[],
    body: Record<string, unknown> = {}
  ) =>
    (await repliesRoute()).POST(
      new NextRequest('https://tuturuuu.com/api/v1/mastermind/fleet/replies', {
        method: 'POST',
        headers: { 'idempotency-key': replyId },
        body: JSON.stringify({
          machineId: 'skr-m4',
          threadId: THREAD,
          text: 'See file',
          attachments: ids,
          ...body,
        }),
      }),
      params()
    );

  it('seals the manifest, binds objects into the signature and derives per-machine fetch capabilities', async () => {
    const replyId = randomUUID();
    const file = await finalized(replyId);
    expect((await send(replyId, [file.id])).status).toBe(202);
    const sent = mocks.bridge!.sendV2!.mock.calls[0]![0];
    expect(bridgeReplyV2EnvelopeSchema.safeParse(sent.envelope).success).toBe(
      true
    );
    expect(sent.envelope.objects).toEqual([file.id]);
    expect(sent.sig).toBe(
      createHmac('sha256', SECRET)
        .update(bridgeReplyV2SigningString(sent.envelope))
        .digest('hex')
    );
    expect(JSON.stringify(sent)).not.toContain('notes.txt');
    expect(JSON.stringify(sent)).not.toContain(file.sha256!);
    const data = Buffer.from(sent.envelope.box.data, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derive(BRIDGE_SEAL_KEY_INFO_V2),
      Buffer.from(sent.envelope.box.iv, 'base64url')
    );
    decipher.setAAD(Buffer.from(bridgeReplyV2SealContext(replyId, 'skr-m4')));
    decipher.setAuthTag(data.subarray(data.length - 16));
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(0, data.length - 16)),
        decipher.final(),
      ]).toString('utf8')
    );
    expect(payload).toEqual({
      text: 'See file',
      files: [
        {
          id: file.id,
          kind: 'text',
          mime: 'text/plain',
          size: 5,
          sha256: file.sha256,
          name: 'notes.txt',
        },
      ],
    });
    const capability = (machineId: string) =>
      createHmac('sha256', derive(BRIDGE_FETCH_KEY_INFO))
        .update(
          bridgeFetchString({
            replyId,
            machineId,
            objectId: file.id,
            sha256: file.sha256!,
          })
        )
        .digest('hex');
    const hash = (value: string) =>
      createHash('sha256').update(value).digest('hex');
    expect(sent.fetch).toEqual([
      { id: file.id, hash: hash(capability('skr-m4')) },
    ]);
    // Another machine's capability does not match what the store holds.
    expect(hash(capability('skr-m3'))).not.toBe(sent.fetch[0].hash);
  });

  it('rebuilds the identical bundle on retry and a different one for other files', async () => {
    const replyId = randomUUID();
    const first = await finalized(replyId);
    await send(replyId, [first.id]);
    mocks.records.set(first.id, { ...first, state: 'bound' });
    await send(replyId, [first.id]);
    const second = await finalized(replyId);
    await send(replyId, [second.id]);
    const digests = mocks.bridge!.sendV2!.mock.calls.map(
      (call) => call[0].envelope.textDigest
    );
    expect(digests[0]).toBe(digests[1]);
    expect(digests[2]).not.toBe(digests[0]);
  });

  it('refuses a record reused across targets, sessions or replies', async () => {
    const replyId = randomUUID();
    for (const over of [
      { threadId: 'thread:other' },
      { replyId: randomUUID() },
      { credential: credential('session-2') },
      { state: 'reserved' as const },
      { machineId: 'skr-m3' },
    ]) {
      const file = await finalized(replyId, over);
      const response = await send(replyId, [file.id]);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'attachment_refused' });
    }
    expect(
      (await send(replyId, [randomUUID()], { environmentId: 'env-2' })).status
    ).toBe(422);
    expect(mocks.bridge!.sendV2).not.toHaveBeenCalled();
  });
});
