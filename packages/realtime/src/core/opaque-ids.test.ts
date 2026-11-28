import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  channelTicketOwner,
  collaborationOwnerBinding,
  collaborationPresenceId,
  collaborationTicketOwnerMatches,
  meetRoomAccountAlias,
  openChannelOwner,
  openPreviewOwner,
  sealChannelOwner,
  sealPreviewOwner,
} from './opaque-ids';

const SECRET = 'opaque-id-fixture-secret';
const OWNER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '10000000-0000-4000-8000-000000000002';
const TOPIC = 'meeting-document-20000000-0000-4000-8000-000000000001';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe('Meet room account aliases', () => {
  it('match the call socket derivation, so one person has one alias per room', () => {
    const digest = createHmac('sha256', SECRET)
      .update(`meet-room-account:ws:meeting:${ACCOUNT}`)
      .digest('hex');
    const alias = meetRoomAccountAlias(SECRET, 'ws:meeting', ACCOUNT);
    expect(alias).toMatch(UUID);
    expect(alias.replaceAll('-', '').slice(0, 12)).toBe(digest.slice(0, 12));
    expect(alias).toBe(
      meetRoomAccountAlias(` ${SECRET} `, 'ws:meeting', ACCOUNT)
    );
    expect(alias).not.toBe(meetRoomAccountAlias(SECRET, 'ws:other', ACCOUNT));
    expect(alias).not.toContain(ACCOUNT);
  });

  it('refuse to derive without a secret', () => {
    expect(() => meetRoomAccountAlias(' ', 'room', ACCOUNT)).toThrow();
    expect(() => collaborationPresenceId(undefined, 'room', ACCOUNT)).toThrow();
  });
});

describe('programming room ids', () => {
  it('keep presence and owner bindings domain-separated and room-scoped', () => {
    const presence = collaborationPresenceId(SECRET, 'room', ACCOUNT);
    expect(presence).toMatch(UUID);
    expect(presence).not.toBe(ACCOUNT);
    expect(presence).not.toBe(
      collaborationOwnerBinding(SECRET, 'room', ACCOUNT)
    );
    expect(presence).not.toBe(meetRoomAccountAlias(SECRET, 'room', ACCOUNT));
    expect(presence).not.toBe(
      collaborationPresenceId(SECRET, 'other', ACCOUNT)
    );
  });

  it('accept an owner binding only on a browser join ticket', () => {
    const room = { roomId: 'room', ownerId: OWNER };
    const binding = collaborationOwnerBinding(SECRET, 'room', OWNER);
    expect(
      collaborationTicketOwnerMatches(
        SECRET,
        { kind: 'join', ownerId: binding },
        room
      )
    ).toBe(true);
    expect(
      collaborationTicketOwnerMatches(
        SECRET,
        { kind: 'join', ownerId: OWNER },
        room
      )
    ).toBe(true);
    for (const kind of ['seed', 'checkpoint', 'runner-files', 'mira-code'])
      expect(
        collaborationTicketOwnerMatches(
          SECRET,
          { kind, ownerId: binding },
          room
        )
      ).toBe(false);
    expect(
      collaborationTicketOwnerMatches(
        SECRET,
        {
          kind: 'join',
          ownerId: collaborationOwnerBinding(SECRET, 'other', OWNER),
        },
        room
      )
    ).toBe(false);
    expect(
      collaborationTicketOwnerMatches(
        'another-secret',
        { kind: 'join', ownerId: binding },
        room
      )
    ).toBe(false);
  });
});

describe('sealed channel owners', () => {
  it('round-trip for the same topic and secret without exposing the id', () => {
    const seal = sealChannelOwner(SECRET, TOPIC, OWNER);
    expect(seal).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(Buffer.from(seal, 'base64url').toString('latin1')).not.toContain(
      OWNER
    );
    expect(seal).not.toBe(sealChannelOwner(SECRET, TOPIC, OWNER));
    expect(openChannelOwner(SECRET, TOPIC, seal)).toBe(OWNER);
    expect(channelTicketOwner(SECRET, { topic: TOPIC, ownerSeal: seal })).toBe(
      OWNER
    );
  });

  it('reject another topic, another secret and any tampering', () => {
    const seal = sealChannelOwner(SECRET, TOPIC, OWNER);
    expect(openChannelOwner(SECRET, `${TOPIC}-x`, seal)).toBeNull();
    expect(openChannelOwner('another-secret', TOPIC, seal)).toBeNull();
    const raw = Buffer.from(seal, 'base64url');
    const last = raw.length - 1;
    raw[last] = (raw[last] ?? 0) ^ 1;
    expect(
      openChannelOwner(SECRET, TOPIC, raw.toString('base64url'))
    ).toBeNull();
    expect(openChannelOwner(SECRET, TOPIC, 'AAAA')).toBeNull();
    expect(
      channelTicketOwner(SECRET, {
        topic: TOPIC,
        ownerId: OWNER,
        ownerSeal: 'AAAA',
      })
    ).toBeNull();
  });

  it('read a plain owner from service tickets', () => {
    expect(channelTicketOwner(SECRET, { topic: TOPIC, ownerId: OWNER })).toBe(
      OWNER
    );
    expect(channelTicketOwner(SECRET, { topic: 'task-editor-x' })).toBeNull();
  });
});

describe('sealed playground preview owners', () => {
  const scope = {
    projectId: '40000000-0000-4000-8000-000000000001',
    port: 3000,
  };
  it('open only for the project, port and room they were sealed to', () => {
    const seal = sealPreviewOwner(SECRET, { ...scope, roomId: 'room' }, OWNER);
    expect(Buffer.from(seal, 'base64url').toString('latin1')).not.toContain(
      OWNER
    );
    expect(openPreviewOwner(SECRET, { ...scope, roomId: 'room' }, seal)).toBe(
      OWNER
    );
    expect(openPreviewOwner(SECRET, scope, seal)).toBeNull();
    expect(
      openPreviewOwner(SECRET, { ...scope, port: 3001, roomId: 'room' }, seal)
    ).toBeNull();
    expect(
      openPreviewOwner('another-secret', { ...scope, roomId: 'room' }, seal)
    ).toBeNull();
  });

  it('never open as a channel seal, or the reverse', () => {
    const preview = sealPreviewOwner(SECRET, scope, OWNER);
    expect(openChannelOwner(SECRET, TOPIC, preview)).toBeNull();
    const channel = sealChannelOwner(SECRET, TOPIC, OWNER);
    expect(openPreviewOwner(SECRET, scope, channel)).toBeNull();
  });
});
