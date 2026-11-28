import { channelTicketSchema } from '@tuturuuu/realtime/channels';
import {
  meetRoomAccountAlias,
  openChannelOwner,
} from '@tuturuuu/realtime/core/opaque-ids';
import { verifyRealtimePayload } from '@tuturuuu/realtime/core/token';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  joinMeetingDocument,
  readMeetingDocumentsForViewer,
  runMeetingDocumentCommand,
} from './documents';
import type { SignedInMeetCallAccess } from './room-service';

const backend = vi.hoisted(() => ({ rpc: vi.fn(), room: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: backend.rpc,
  AccountServiceError: class extends Error {},
}));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('./room-service', () => ({ callRoomService: backend.room }));

const SECRET = 'documents-viewer-fixture-secret';
const WORKSPACE = '30000000-0000-4000-8000-000000000001';
const MEETING = '20000000-0000-4000-8000-000000000001';
const DOCUMENT = '40000000-0000-4000-8000-000000000001';
const TAB = '50000000-0000-4000-8000-000000000001';
const id = {
  host: '10000000-0000-4000-8000-000000000001',
  member: '10000000-0000-4000-8000-000000000002',
  outsider: '10000000-0000-4000-8000-000000000003',
};
type Viewer = keyof typeof id;
const ROOM = `${WORKSPACE}:${MEETING}`;

function access(viewer: Viewer) {
  return {
    user: { id: id[viewer] },
    meeting: { id: MEETING, ws_id: WORKSPACE, creator_id: id.host },
    isHost: viewer === 'host',
    admission: viewer === 'outsider' ? 'lobby' : 'open',
    canReadWorkspace: viewer !== 'outsider',
    displayName: viewer,
  } as unknown as SignedInMeetCallAccess;
}

/** Room state with a tab, a Mira request and an edit from each person. */
function roomState() {
  const tab = (tabId: string, by: string) => ({
    id: tabId,
    kind: 'doc',
    createdBy: by,
    createdAt: 1,
    updatedAt: 1,
  });
  const edit = (editId: string, by: string) => ({
    id: editId,
    tabId: 'primary',
    source: 'chat',
    action: 'draft',
    askedBy: by,
    askedByName: 'Someone',
    before: '',
    after: 'text',
    createdAt: 2,
    review: 'pending',
  });
  return {
    tabs: [
      { id: 'primary', kind: 'doc', createdAt: 0, updatedAt: 0 },
      tab('tab-host', id.host),
      tab('tab-member', id.member),
      tab('tab-outsider', id.outsider),
    ],
    mira: {
      requestId: 'request',
      activeTabId: 'primary',
      source: 'chat',
      status: 'editing',
      askedBy: id.member,
      updatedAt: 3,
      expiresAt: 4,
    },
    edits: [
      edit('edit-host', id.host),
      edit('edit-member', id.member),
      edit('edit-outsider', id.outsider),
    ],
  };
}

const others = (viewer: Viewer) =>
  (Object.keys(id) as Viewer[]).filter((name) => name !== viewer);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', SECRET);
  backend.room.mockImplementation(async (_access, command) =>
    command.action === 'programming.read' ? {} : roomState()
  );
  backend.rpc.mockResolvedValue({
    documentId: DOCUMENT,
    revision: 3,
    state: [],
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('document tabs metadata', () => {
  it.each(['host', 'member'] as const)(
    'returns account ids unchanged to the %s',
    async (viewer) => {
      expect(await readMeetingDocumentsForViewer(access(viewer))).toEqual(
        roomState()
      );
      expect(
        await runMeetingDocumentCommand(access(viewer), {
          action: 'close',
          tabId: TAB,
        })
      ).toEqual(roomState());
    }
  );

  it('gives a signed-in outsider room aliases for everyone else', async () => {
    const outsider = access('outsider');
    for (const documents of [
      await readMeetingDocumentsForViewer(outsider),
      await runMeetingDocumentCommand(outsider, {
        action: 'close',
        tabId: TAB,
      }),
    ]) {
      const wire = JSON.stringify(documents);
      for (const name of others('outsider'))
        expect(wire).not.toContain(id[name]);
      const alias = (name: Viewer) =>
        meetRoomAccountAlias(SECRET, ROOM, id[name]);
      expect(documents.tabs.map((tab) => tab.createdBy)).toEqual([
        undefined,
        alias('host'),
        alias('member'),
        id.outsider,
      ]);
      expect(documents.mira?.askedBy).toBe(alias('member'));
      expect(documents.edits.map((edit) => edit.askedBy)).toEqual([
        alias('host'),
        alias('member'),
        id.outsider,
      ]);
    }
  });

  it('omits other people’s ids for an outsider when no alias secret is set', async () => {
    vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', '');
    const documents = await readMeetingDocumentsForViewer(access('outsider'));
    const wire = JSON.stringify(documents);
    for (const name of others('outsider')) expect(wire).not.toContain(id[name]);
    expect(documents.tabs.at(-1)?.createdBy).toBe(id.outsider);
    expect(documents.mira).not.toHaveProperty('askedBy');
  });
});

describe('document channel join', () => {
  const joinAs = async (viewer: Viewer) => {
    const joined = await joinMeetingDocument(access(viewer), 'primary');
    const [encoded] = joined.token.split('.');
    const readable = Buffer.from(encoded!, 'base64url').toString('utf8');
    const ticket = channelTicketSchema.parse(
      verifyRealtimePayload(joined.token, SECRET)
    );
    return {
      joined,
      ticket,
      wire: `${readable}${JSON.stringify({ ...joined, token: '' })}`,
    };
  };

  it('gives a signed-in outsider a ticket without platform account ids', async () => {
    const { joined, ticket, wire } = await joinAs('outsider');
    for (const name of Object.keys(id) as Viewer[])
      expect(wire).not.toContain(id[name]);
    const alias = meetRoomAccountAlias(SECRET, ROOM, id.outsider);
    expect(ticket.userId).toBe(alias);
    expect(joined.user.id).toBe(alias);
    expect(ticket.ownerId).toBeUndefined();
    expect(openChannelOwner(SECRET, ticket.topic, ticket.ownerSeal!)).toBe(
      id.host
    );
  });

  it.each(['host', 'member'] as const)(
    'gives the %s the room alias and the plain owner every room accepts',
    async (viewer) => {
      const { joined, ticket, wire } = await joinAs(viewer);
      const alias = meetRoomAccountAlias(SECRET, ROOM, id[viewer]);
      expect(ticket.userId).toBe(alias);
      expect(joined.user.id).toBe(alias);
      expect(ticket.ownerId).toBe(id.host);
      expect(ticket.ownerSeal).toBeUndefined();
      // Only the owner is named; presence identity stays the alias.
      for (const name of others('host')) expect(wire).not.toContain(id[name]);
    }
  );

  it('refuses to issue a ticket without the realtime secret', async () => {
    vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', '');
    await expect(joinMeetingDocument(access('member'))).rejects.toMatchObject({
      status: 503,
    });
  });
});
