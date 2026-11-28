import { collaborationTicketSchema } from '@tuturuuu/realtime/collaboration';
import {
  collaborationOwnerBinding,
  collaborationPresenceId,
} from '@tuturuuu/realtime/core/opaque-ids';
import { verifyRealtimePayload } from '@tuturuuu/realtime/core/token';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { programmingRoomTicket } from './programming-collaboration';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: vi.fn(),
  AccountServiceError: class extends Error {
    constructor(readonly status: number) {
      super('Rejected');
    }
  },
}));
vi.mock('./playground-service', () => ({
  getPlayground: vi.fn(),
  getPlaygroundMetadata: vi.fn(),
  getPlaygroundRun: vi.fn(),
  savePlayground: vi.fn(),
}));

const SECRET = 'programming-ids-fixture-secret';
const OWNER = '10000000-0000-4000-8000-000000000001';
const ACTOR = '10000000-0000-4000-8000-000000000003';
const PROJECT = '40000000-0000-4000-8000-000000000001';
const ROOM = `playground:${PROJECT}`;
const seed = { files: [], command: 'python main.py', revision: 2 };
let serverTickets: unknown[] = [];

function scope(bindOwner?: boolean) {
  return {
    actorId: ACTOR,
    ownerId: OWNER,
    resourceId: PROJECT,
    resource: 'playground' as const,
    roomId: ROOM,
    role: 'editor' as const,
    displayName: 'Participant',
    ...(bindOwner ? { bindOwner } : {}),
  };
}

beforeEach(() => {
  serverTickets = [];
  vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', SECRET);
  vi.stubEnv('PROGRAMMING_REALTIME_URL', 'wss://realtime.example.invalid');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, init: RequestInit) => {
      const raw = new Headers(init.headers)
        .get('Authorization')
        ?.replace('Bearer ', '');
      serverTickets.push(verifyRealtimePayload(raw ?? '', SECRET));
      return init.method === 'POST'
        ? Response.json({ revision: 2 })
        : Response.json({ ready: false });
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('programming room browser tickets', () => {
  it('name a Meet participant’s host by a room binding, never by account id', async () => {
    const joined = await programmingRoomTicket(scope(true), seed);
    const [encoded] = joined.token.split('.');
    expect(Buffer.from(encoded!, 'base64url').toString('utf8')).not.toContain(
      OWNER
    );
    const ticket = collaborationTicketSchema.parse(
      verifyRealtimePayload(joined.token, SECRET)
    );
    expect(ticket.ownerId).toBe(collaborationOwnerBinding(SECRET, ROOM, OWNER));
    expect(JSON.stringify({ ...joined, token: '' })).not.toContain(OWNER);
    // The seed the room trusts still names the real owner, server to server.
    expect(serverTickets).toHaveLength(2);
    for (const server of serverTickets)
      expect(server).toMatchObject({ ownerId: OWNER, kind: 'seed' });
  });

  it('return the presence id the room shows, not the account id', async () => {
    const joined = await programmingRoomTicket(scope(true), seed);
    expect(joined.actorId).toBe(collaborationPresenceId(SECRET, ROOM, ACTOR));
    expect(joined.actorId).not.toBe(ACTOR);
  });

  it('keep the owner id for playground collaboration outside Meet', async () => {
    const joined = await programmingRoomTicket(scope(), seed);
    const ticket = collaborationTicketSchema.parse(
      verifyRealtimePayload(joined.token, SECRET)
    );
    expect(ticket.ownerId).toBe(OWNER);
    expect(joined.actorId).toBe(collaborationPresenceId(SECRET, ROOM, ACTOR));
  });
});
