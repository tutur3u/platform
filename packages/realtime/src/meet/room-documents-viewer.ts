import type { readRoomDocuments } from './room-documents';

type RoomDocuments = ReturnType<typeof readRoomDocuments>;
type Tab = RoomDocuments['tabs'][number];
type Presence = NonNullable<RoomDocuments['mira']>;
type Edit = RoomDocuments['edits'][number];

/** The document tab state one viewer receives over the document API. */
export type RoomDocumentsView = {
  tabs: Tab[];
  mira: (Omit<Presence, 'askedBy'> & { askedBy?: string }) | null;
  edits: (Omit<Edit, 'askedBy'> & { askedBy?: string })[];
};

export type RoomDocumentsViewer = {
  /** The viewer's own platform account id. */
  accountId: string;
  /**
   * Whether the viewer may read other people's account ids: the host and
   * workspace members (open admission). Signed-in people outside the
   * workspace join through the lobby and may not.
   */
  seesAccountIds: boolean;
};

function project<K extends string, T extends { [P in K]?: string }>(
  entry: T,
  key: K,
  viewer: RoomDocumentsViewer,
  alias: (accountId: string) => string | undefined
): T {
  const id = entry[key] as string | undefined;
  // A viewer keeps its own id: the client compares it to decide what it may
  // close or review.
  if (!id || id === viewer.accountId) return entry;
  const opaque = alias(id);
  if (opaque && opaque !== id) return { ...entry, [key]: opaque };
  const { [key]: _hidden, ...rest } = entry;
  return rest as unknown as T;
}

/**
 * Tab creators and Mira requesters as one viewer may see them. Members get
 * the state unchanged. For anyone else, every account id other than their
 * own becomes the room alias, or is omitted when no alias is available.
 */
export function roomDocumentsForViewer(
  documents: RoomDocuments,
  viewer: RoomDocumentsViewer,
  alias: (accountId: string) => string | undefined
): RoomDocumentsView {
  if (viewer.seesAccountIds) return documents;
  return {
    tabs: documents.tabs.map((tab) => project(tab, 'createdBy', viewer, alias)),
    mira: documents.mira
      ? project(
          documents.mira as Presence & { askedBy?: string },
          'askedBy',
          viewer,
          alias
        )
      : null,
    edits: documents.edits.map((edit) =>
      project(edit as Edit & { askedBy?: string }, 'askedBy', viewer, alias)
    ),
  };
}
