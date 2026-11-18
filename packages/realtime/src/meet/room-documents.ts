import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { MIRA_PRIVATE_NOTICE_VERSION } from './room-mira-private';
import type { RoomServiceState } from './room-service';

/** The original room document keeps its channel and workspace checkpoint. */
export const ROOM_DOCUMENT_PRIMARY_TAB_ID = 'primary';
export const ROOM_DOCUMENT_MAX_TABS = 12;
/** Edit records hold bounded excerpts; the document itself holds full text. */
export const ROOM_DOCUMENT_MAX_EDITS = 8;
export const ROOM_DOCUMENT_EDIT_BEFORE_CHARS = 500;
export const ROOM_DOCUMENT_EDIT_AFTER_CHARS = 1000;
export const MIRA_DOCUMENT_PRESENCE_TTL_MS = 90_000;

const controlCharacters = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
export const roomDocumentKindSchema = z.enum([
  'doc',
  'notes',
  'rubric',
  'summary',
]);
export type RoomDocumentKind = z.infer<typeof roomDocumentKindSchema>;
export const roomDocumentTabIdSchema = z.union([
  z.literal(ROOM_DOCUMENT_PRIMARY_TAB_ID),
  z.uuid(),
]);
export const roomDocumentTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !controlCharacters.test(value), 'Invalid title');
export const miraDocumentSourceSchema = z.enum(['chat', 'live']);
export type MiraDocumentSource = z.infer<typeof miraDocumentSourceSchema>;
export const miraDocumentActionSchema = z.enum([
  'draft',
  'refine',
  'summarize',
]);
export type MiraDocumentAction = z.infer<typeof miraDocumentActionSchema>;
const sectionSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !controlCharacters.test(value), 'Invalid section');

export type RoomDocumentTab = {
  id: string;
  kind: RoomDocumentKind;
  /** Absent titles render the localized default for the tab kind. */
  title?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
};
export type MiraDocumentPresence = {
  /** The assist request that owns this presence; only it may clear it. */
  requestId: string;
  activeTabId: string;
  source: MiraDocumentSource;
  status: 'editing' | 'reviewing';
  section?: string;
  askedBy: string;
  updatedAt: number;
  expiresAt: number;
};
export type MiraDocumentEdit = {
  id: string;
  tabId: string;
  source: MiraDocumentSource;
  action: MiraDocumentAction;
  askedBy: string;
  askedByName?: string;
  before: string;
  after: string;
  createdAt: number;
  review: 'pending' | 'accepted' | 'reverted';
};
export type RoomDocumentsState = {
  tabs: RoomDocumentTab[];
  mira?: MiraDocumentPresence | null;
  edits: MiraDocumentEdit[];
};

/**
 * Client-facing commands. Mira presence and edit records are composed only by
 * the server after it verifies consent, authority and billing; the document
 * API never forwards those actions from a request body.
 */
export const documentRoomCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('documents.read') }).strict(),
  z
    .object({
      action: z.literal('documents.create'),
      tab: z
        .object({
          id: z.uuid(),
          kind: roomDocumentKindSchema,
          title: roomDocumentTitleSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('documents.rename'),
      tabId: roomDocumentTabIdSchema,
      title: roomDocumentTitleSchema.nullable(),
    })
    .strict(),
  z.object({ action: z.literal('documents.close'), tabId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('documents.mira.review'),
      editId: z.uuid(),
      decision: z.enum(['accepted', 'reverted']),
    })
    .strict(),
]);
const consentRevisionSchema = z.number().int().positive();
export const miraDocumentServerCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('documents.mira.presence'),
      requestId: z.uuid(),
      consentRevision: consentRevisionSchema.optional(),
      presence: z
        .object({
          activeTabId: roomDocumentTabIdSchema,
          source: miraDocumentSourceSchema,
          status: z.enum(['editing', 'reviewing']),
          section: sectionSchema.optional(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal('documents.mira.edit'),
      consentRevision: consentRevisionSchema,
      edit: z
        .object({
          id: z.uuid(),
          tabId: roomDocumentTabIdSchema,
          source: miraDocumentSourceSchema,
          action: miraDocumentActionSchema,
          before: z.string().max(20_000),
          after: z.string().min(1).max(20_000),
        })
        .strict(),
    })
    .strict(),
]);
export type DocumentRoomCommand = z.infer<typeof documentRoomCommandSchema>;

/** Primary channel stays unchanged so existing rooms and native clients keep their document. */
export function meetingDocumentTopic(meetingId: string, tabId: string) {
  return tabId === ROOM_DOCUMENT_PRIMARY_TAB_ID
    ? `meeting-document-${meetingId}`
    : `meeting-document-${meetingId}-${tabId}`;
}

export function roomDocumentTabs(
  state: RoomDocumentsState | undefined
): RoomDocumentTab[] {
  const tabs = state?.tabs ?? [];
  return tabs.some((tab) => tab.id === ROOM_DOCUMENT_PRIMARY_TAB_ID)
    ? tabs
    : [
        {
          id: ROOM_DOCUMENT_PRIMARY_TAB_ID,
          kind: 'doc',
          createdAt: 0,
          updatedAt: 0,
        },
        ...tabs,
      ];
}

export function readRoomDocuments(
  state: RoomDocumentsState | undefined,
  now = Date.now()
) {
  const mira = state?.mira;
  return {
    tabs: roomDocumentTabs(state),
    mira: mira && mira.expiresAt > now ? mira : null,
    edits: state?.edits ?? [],
  };
}

/**
 * Room-visible Mira output is written only while the requester's Private Mira
 * Continue choice is the exact revision the server checked, so a choice that
 * changes during generation cannot race the write.
 */
function privateMiraContinues(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  account: string,
  revision: number | undefined
) {
  const choice = snapshot.miraPrivate?.choices[account];
  return (
    revision !== undefined &&
    choice?.choice === 'continue' &&
    choice.version === MIRA_PRIVATE_NOTICE_VERSION &&
    choice.accountId === account &&
    choice.meetingId === token.meetingId &&
    choice.revision === revision
  );
}

function excerpt(value: string, limit: number) {
  const characters = Array.from(value.trim());
  return characters.length > limit
    ? `${characters.slice(0, limit - 1).join('')}…`
    : characters.join('');
}

type Result = {
  state: RoomServiceState;
  body: unknown;
  status?: number;
};

/** Validates every tab mutation against room admission and per-room caps. */
export function applyRoomDocuments(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
): Result | null {
  const action =
    input && typeof input === 'object' && 'action' in input
      ? String((input as { action: unknown }).action)
      : '';
  if (!action.startsWith('documents.')) return null;
  const parsed = z
    .union([documentRoomCommandSchema, miraDocumentServerCommandSchema])
    .safeParse(input);
  const fail = (error: string, status = 403): Result => ({
    state: snapshot,
    body: { error },
    status,
  });
  if (!parsed.success) return fail('Invalid document request', 400);
  const account = token.accountId ?? token.userId;
  const admitted =
    token.role === 'host' ||
    token.scopes.includes('meet:workspace-member') ||
    !!snapshot.approved?.[account] ||
    Object.values(snapshot.presence).some(
      (person) => (person.accountId ?? person.userId) === account
    );
  if (!admitted || snapshot.ended) return fail('Document access denied');
  const current = readRoomDocuments(snapshot.documents, now);
  const command = parsed.data;
  if (command.action === 'documents.read')
    return { state: snapshot, body: current };
  const tabs = current.tabs;
  const find = (id: string) => tabs.find((tab) => tab.id === id);
  const commit = (
    documents: RoomDocumentsState,
    body: unknown = readRoomDocuments(documents, now)
  ): Result => ({ state: { ...snapshot, documents }, body });
  const base: RoomDocumentsState = {
    tabs,
    mira: current.mira,
    edits: current.edits,
  };

  if (command.action === 'documents.create') {
    if (find(command.tab.id)) return fail('Document already exists', 409);
    if (tabs.length >= ROOM_DOCUMENT_MAX_TABS)
      return fail('Document limit reached', 409);
    return commit({
      ...base,
      tabs: [
        ...tabs,
        {
          id: command.tab.id,
          kind: command.tab.kind,
          ...(command.tab.title ? { title: command.tab.title } : {}),
          createdBy: account,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  }
  if (command.action === 'documents.rename') {
    const tab = find(command.tabId);
    if (!tab) return fail('Document not found', 404);
    const { title: _previous, ...rest } = tab;
    const renamed: RoomDocumentTab = {
      ...rest,
      ...(command.title ? { title: command.title } : {}),
      updatedAt: now,
    };
    return commit({
      ...base,
      tabs: tabs.map((entry) => (entry.id === tab.id ? renamed : entry)),
    });
  }
  if (command.action === 'documents.close') {
    const tab = find(command.tabId);
    if (!tab) return fail('Document not found', 404);
    if (token.role !== 'host' && tab.createdBy !== account)
      return fail('Only the host or creator can close this document');
    return commit({
      tabs: tabs.filter((entry) => entry.id !== tab.id),
      mira: base.mira?.activeTabId === tab.id ? null : base.mira,
      edits: base.edits.filter((edit) => edit.tabId !== tab.id),
    });
  }
  if (command.action === 'documents.mira.review') {
    const edit = base.edits.find((entry) => entry.id === command.editId);
    if (!edit) return fail('Edit not found', 404);
    if (token.role !== 'host' && edit.askedBy !== account)
      return fail('Only the host or requester can review this edit');
    return commit({
      ...base,
      edits: base.edits.map((entry) =>
        entry.id === edit.id ? { ...entry, review: command.decision } : entry
      ),
    });
  }
  if (command.action === 'documents.mira.presence') {
    if (!command.presence) {
      // A request clears only its own presence, never a newer request's.
      if (
        base.mira?.requestId !== command.requestId ||
        base.mira.askedBy !== account
      )
        return { state: snapshot, body: current };
      return commit({ ...base, mira: null });
    }
    if (
      !privateMiraContinues(snapshot, token, account, command.consentRevision)
    )
      return fail('Private Mira choice changed');
    if (!find(command.presence.activeTabId))
      return fail('Document not found', 404);
    return commit({
      ...base,
      mira: {
        ...command.presence,
        requestId: command.requestId,
        askedBy: account,
        updatedAt: now,
        expiresAt: now + MIRA_DOCUMENT_PRESENCE_TTL_MS,
      },
    });
  }
  const edit = command.edit;
  if (!privateMiraContinues(snapshot, token, account, command.consentRevision))
    return fail('Private Mira choice changed');
  if (!find(edit.tabId)) return fail('Document not found', 404);
  if (base.edits.some((entry) => entry.id === edit.id))
    return fail('Edit already recorded', 409);
  const askedByName = Object.values(snapshot.presence).find(
    (person) => (person.accountId ?? person.userId) === account
  )?.displayName;
  return commit({
    ...base,
    tabs: tabs.map((tab) =>
      tab.id === edit.tabId ? { ...tab, updatedAt: now } : tab
    ),
    edits: [
      ...base.edits,
      {
        ...edit,
        before: excerpt(edit.before, ROOM_DOCUMENT_EDIT_BEFORE_CHARS),
        after: excerpt(edit.after, ROOM_DOCUMENT_EDIT_AFTER_CHARS),
        askedBy: account,
        ...(askedByName ? { askedByName } : {}),
        createdAt: now,
        review: 'pending' as const,
      },
    ].slice(-ROOM_DOCUMENT_MAX_EDITS),
  });
}
