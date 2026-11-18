import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  applyRoomDocuments,
  MIRA_DOCUMENT_PRESENCE_TTL_MS,
  meetingDocumentTopic,
  ROOM_DOCUMENT_EDIT_AFTER_CHARS,
  ROOM_DOCUMENT_MAX_EDITS,
  ROOM_DOCUMENT_MAX_TABS,
  ROOM_DOCUMENT_PRIMARY_TAB_ID,
  readRoomDocuments,
} from './room-documents';
import { MIRA_PRIVATE_NOTICE_VERSION } from './room-mira-private';
import { type RoomServiceState, roomService } from './room-service';

const account = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const other = '1d3b8f9a-3a61-4b8e-9f7c-6a3d1f0c2b11';
const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const tabId = '7f0c2e5a-4b1d-4c6e-8a9f-0d1e2f3a4b5c';
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId,
  mode: 'call',
  role: 'speaker',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: account,
  accountId: account,
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
const host = { ...token, role: 'host' as const };
const stranger = { ...token, userId: other, accountId: other };
const now = 1_800_000_000_000;
const choice = (
  value: 'continue' | 'mute' | 'leave',
  revision: number
): NonNullable<RoomServiceState['miraPrivate']> => ({
  choices: {
    [account]: {
      choice: value,
      version: MIRA_PRIVATE_NOTICE_VERSION,
      meetingId,
      accountId: account,
      recordedAt: 1,
      revision,
    },
  },
  sessions: {},
});
const initial = (): RoomServiceState => ({
  ...admitOrHold(createMeetRoomSnapshot(), token, '2026-09-09T00:00:00Z').state,
  miraPrivate: choice('continue', 1),
});
const request = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
const uuid = (index: number) =>
  `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
function run(
  state: RoomServiceState,
  input: unknown,
  actor: typeof token = token
) {
  const result = applyRoomDocuments(state, actor, input, now);
  if (!result) throw new Error('Expected a document result');
  return result;
}
const create = (state = initial(), id = tabId) =>
  run(state, {
    action: 'documents.create',
    tab: { id, kind: 'rubric', title: 'Lab Rubric' },
  });

describe('room documents', () => {
  it('keeps the primary channel name for existing rooms', () => {
    expect(meetingDocumentTopic(meetingId, ROOM_DOCUMENT_PRIMARY_TAB_ID)).toBe(
      `meeting-document-${meetingId}`
    );
    expect(meetingDocumentTopic(meetingId, tabId)).toBe(
      `meeting-document-${meetingId}-${tabId}`
    );
  });

  it('ignores commands outside the documents namespace', () => {
    expect(
      applyRoomDocuments(initial(), token, { action: 'programming.read' })
    ).toBeNull();
  });

  it('lists the primary document before any tab exists', () => {
    const result = run(initial(), { action: 'documents.read' });
    expect(result.body).toEqual({
      tabs: [
        {
          id: ROOM_DOCUMENT_PRIMARY_TAB_ID,
          kind: 'doc',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      mira: null,
      edits: [],
    });
  });

  it('creates, renames and closes tabs for admitted participants', () => {
    const created = create();
    expect(created.status).toBeUndefined();
    const tabs = readRoomDocuments(created.state.documents).tabs;
    expect(tabs.map((tab) => tab.id)).toEqual([
      ROOM_DOCUMENT_PRIMARY_TAB_ID,
      tabId,
    ]);
    expect(tabs[1]).toMatchObject({
      kind: 'rubric',
      title: 'Lab Rubric',
      createdBy: account,
    });
    const renamed = run(created.state, {
      action: 'documents.rename',
      tabId,
      title: '  Lab 04 Rubric  ',
    });
    expect(readRoomDocuments(renamed.state.documents).tabs[1]?.title).toBe(
      'Lab 04 Rubric'
    );
    const reset = run(renamed.state, {
      action: 'documents.rename',
      tabId: ROOM_DOCUMENT_PRIMARY_TAB_ID,
      title: null,
    });
    expect(
      readRoomDocuments(reset.state.documents).tabs[0]?.title
    ).toBeUndefined();
    const closed = run(reset.state, { action: 'documents.close', tabId });
    expect(readRoomDocuments(closed.state.documents).tabs).toHaveLength(1);
  });

  it('rejects duplicate ids, unsafe titles and the cap', () => {
    const created = create();
    expect(create(created.state).status).toBe(409);
    expect(
      run(initial(), {
        action: 'documents.create',
        tab: { id: uuid(1), kind: 'doc', title: 'Bad\u0000title' },
      }).status
    ).toBe(400);
    expect(
      run(initial(), {
        action: 'documents.create',
        tab: { id: 'not-a-uuid', kind: 'doc' },
      }).status
    ).toBe(400);
    let state = initial();
    for (let index = 1; index < ROOM_DOCUMENT_MAX_TABS; index++)
      state = create(state, uuid(index)).state;
    expect(readRoomDocuments(state.documents).tabs).toHaveLength(
      ROOM_DOCUMENT_MAX_TABS
    );
    const full = create(state, uuid(99));
    expect(full.status).toBe(409);
    expect(full.body).toEqual({ error: 'Document limit reached' });
  });

  it('never closes the primary document and limits closing to host or creator', () => {
    const created = create();
    expect(
      run(created.state, {
        action: 'documents.close',
        tabId: ROOM_DOCUMENT_PRIMARY_TAB_ID,
      }).status
    ).toBe(400);
    const approved: RoomServiceState = {
      ...created.state,
      approved: { [other]: { displayName: 'Other' } } as never,
    };
    expect(
      run(approved, { action: 'documents.close', tabId }, stranger).status
    ).toBe(403);
    expect(
      run(approved, { action: 'documents.close', tabId }, host).status
    ).toBeUndefined();
  });

  it('denies people who were never admitted and ended rooms', () => {
    expect(run(initial(), { action: 'documents.read' }, stranger).status).toBe(
      403
    );
    expect(
      run({ ...initial(), ended: true } as RoomServiceState, {
        action: 'documents.read',
      }).status
    ).toBe(403);
  });

  it('records Mira presence with an expiry and clears it with its tab', () => {
    const created = create();
    const present = run(created.state, {
      action: 'documents.mira.presence',
      requestId: request,
      consentRevision: 1,
      presence: {
        activeTabId: tabId,
        source: 'chat',
        status: 'editing',
        section: '§2 Grading Criteria',
      },
    });
    expect(readRoomDocuments(present.state.documents, now).mira).toMatchObject({
      activeTabId: tabId,
      source: 'chat',
      askedBy: account,
      expiresAt: now + MIRA_DOCUMENT_PRESENCE_TTL_MS,
    });
    expect(
      readRoomDocuments(
        present.state.documents,
        now + MIRA_DOCUMENT_PRESENCE_TTL_MS
      ).mira
    ).toBeNull();
    expect(
      run(created.state, {
        action: 'documents.mira.presence',
        requestId: request,
        consentRevision: 1,
        presence: { activeTabId: uuid(5), source: 'chat', status: 'editing' },
      }).status
    ).toBe(404);
    const closed = run(present.state, { action: 'documents.close', tabId });
    expect(readRoomDocuments(closed.state.documents, now).mira).toBeNull();
  });

  it('keeps bounded, attributed Mira edits that the requester can review', () => {
    let state = create().state;
    for (let index = 0; index <= ROOM_DOCUMENT_MAX_EDITS; index++)
      state = run(state, {
        action: 'documents.mira.edit',
        consentRevision: 1,
        edit: {
          id: uuid(index + 1),
          tabId,
          source: 'chat',
          action: 'refine',
          before: 'Partial credit at instructor discretion.',
          after: 'x'.repeat(ROOM_DOCUMENT_EDIT_AFTER_CHARS + 50),
        },
      }).state;
    const edits = readRoomDocuments(state.documents).edits;
    expect(edits).toHaveLength(ROOM_DOCUMENT_MAX_EDITS);
    expect(edits[0]?.id).toBe(uuid(2));
    expect(Array.from(edits[0]!.after)).toHaveLength(
      ROOM_DOCUMENT_EDIT_AFTER_CHARS
    );
    expect(edits[0]).toMatchObject({ askedBy: account, review: 'pending' });
    const reviewed = run(state, {
      action: 'documents.mira.review',
      editId: uuid(2),
      decision: 'accepted',
    });
    expect(readRoomDocuments(reviewed.state.documents).edits[0]?.review).toBe(
      'accepted'
    );
    const approved: RoomServiceState = {
      ...state,
      approved: { [other]: { displayName: 'Other' } } as never,
    };
    expect(
      run(
        approved,
        {
          action: 'documents.mira.review',
          editId: uuid(2),
          decision: 'reverted',
        },
        stranger
      ).status
    ).toBe(403);
  });

  it('is reachable through the trusted room service only', () => {
    expect(
      roomService(initial(), token, { action: 'documents.read' }).status
    ).toBeUndefined();
    expect(
      roomService(
        initial(),
        { ...token, scopes: [] },
        { action: 'documents.read' }
      ).status
    ).toBe(403);
  });

  it('writes Mira output only under the exact checked Private Mira revision', () => {
    const created = create();
    const edit = (state: RoomServiceState, consentRevision?: number) =>
      run(state, {
        action: 'documents.mira.edit',
        ...(consentRevision === undefined ? {} : { consentRevision }),
        edit: {
          id: request,
          tabId,
          source: 'chat',
          action: 'draft',
          before: '',
          after: 'Answer that must stay private.',
        },
      });
    const presence = (state: RoomServiceState, consentRevision?: number) =>
      run(state, {
        action: 'documents.mira.presence',
        requestId: request,
        ...(consentRevision === undefined ? {} : { consentRevision }),
        presence: { activeTabId: tabId, source: 'chat', status: 'reviewing' },
      });
    const changed: RoomServiceState = {
      ...created.state,
      miraPrivate: choice('continue', 2),
    };
    const muted: RoomServiceState = {
      ...created.state,
      miraPrivate: choice('mute', 2),
    };
    for (const state of [changed, muted]) {
      const denied = edit(state, 1);
      expect(denied.status).toBe(403);
      expect(denied.state).toBe(state);
      expect(presence(state, 1).status).toBe(403);
    }
    expect(edit(created.state).status).toBe(400);
    expect(presence(created.state).status).toBe(403);
    expect(edit({ ...created.state, miraPrivate: undefined }, 1).status).toBe(
      403
    );
    const written = edit(created.state, 1);
    expect(written.status).toBeUndefined();
    expect(readRoomDocuments(written.state.documents).edits).toHaveLength(1);
  });

  it('lets a request clear only its own Mira presence', () => {
    const present = run(create().state, {
      action: 'documents.mira.presence',
      requestId: request,
      consentRevision: 1,
      presence: { activeTabId: tabId, source: 'chat', status: 'editing' },
    });
    const otherRequest = run(present.state, {
      action: 'documents.mira.presence',
      requestId: uuid(7),
      presence: null,
    });
    expect(otherRequest.state).toBe(present.state);
    expect(
      readRoomDocuments(otherRequest.state.documents, now).mira?.requestId
    ).toBe(request);
    const own = run(present.state, {
      action: 'documents.mira.presence',
      requestId: request,
      presence: null,
    });
    expect(readRoomDocuments(own.state.documents, now).mira).toBeNull();
  });
});
