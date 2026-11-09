export type HierarchyDocument = {
  id: string;
  name: string | null;
  created_at: string;
  parent_id?: string | null;
  position?: number | null;
};

export type DocumentMove = {
  parent_id: string | null;
  position: number | null;
};
export type MoveResult =
  | {
      kind: 'allowed';
      move: DocumentMove;
      preparation?: { id: string; position: number }[];
      previousPosition?: number;
    }
  | {
      kind: 'denied';
      reason: 'permission' | 'missing' | 'cycle' | 'depth' | 'position';
    };
export type KeyboardMove = 'up' | 'down' | 'indent' | 'outdent';

export function siblings(
  documents: readonly HierarchyDocument[],
  parentId: string | null
) {
  const ids = new Set(documents.map((doc) => doc.id));
  return documents
    .filter((doc) => {
      const parent =
        doc.parent_id && ids.has(doc.parent_id) ? doc.parent_id : null;
      return parent === parentId;
    })
    .sort(
      (a, b) =>
        (a.position ?? Infinity) - (b.position ?? Infinity) ||
        b.created_at.localeCompare(a.created_at) ||
        a.id.localeCompare(b.id)
    );
}

export function ancestors(documents: readonly HierarchyDocument[], id: string) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const result: HierarchyDocument[] = [];
  const seen = new Set([id]);
  let parent = byId.get(id)?.parent_id;
  while (parent && result.length < 16) {
    const doc = byId.get(parent);
    if (!doc || seen.has(parent)) break;
    seen.add(parent);
    result.unshift(doc);
    parent = doc.parent_id;
  }
  return result;
}

export function visibleDocuments(
  documents: readonly HierarchyDocument[],
  expanded: ReadonlySet<string>
) {
  const result: { document: HierarchyDocument; depth: number }[] = [];
  const seen = new Set<string>();
  function visit(parent: string | null, depth: number) {
    if (depth > 16) return;
    for (const document of siblings(documents, parent)) {
      if (seen.has(document.id)) continue;
      seen.add(document.id);
      result.push({ document, depth });
      if (expanded.has(document.id)) visit(document.id, depth + 1);
    }
  }
  visit(null, 1);
  return result;
}

export function preflightMove({
  documents,
  id,
  parentId,
  beforeId = null,
  canManage,
  restorePosition,
}: {
  documents: readonly HierarchyDocument[];
  id: string;
  parentId: string | null;
  beforeId?: string | null;
  canManage: boolean;
  restorePosition?: number | null;
}): MoveResult {
  if (!canManage) return { kind: 'denied', reason: 'permission' };
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  if (!byId.has(id) || (parentId !== null && !byId.has(parentId)))
    return { kind: 'denied', reason: 'missing' };
  const descendants = new Set([id]);
  let frontier = [id];
  let height = 1;
  while (frontier.length) {
    const next = documents.filter(
      (doc) => doc.parent_id && frontier.includes(doc.parent_id)
    );
    if (next.some((doc) => descendants.has(doc.id)))
      return { kind: 'denied', reason: 'cycle' };
    if (!next.length) break;
    next.forEach((doc) => descendants.add(doc.id));
    frontier = next.map((doc) => doc.id);
    height++;
    if (height > 16) return { kind: 'denied', reason: 'depth' };
  }
  if (parentId && descendants.has(parentId))
    return { kind: 'denied', reason: 'cycle' };
  const visitedParents = new Set<string>();
  let cursor = parentId;
  while (cursor) {
    if (visitedParents.has(cursor)) return { kind: 'denied', reason: 'cycle' };
    visitedParents.add(cursor);
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  const parentAncestors = parentId ? ancestors(documents, parentId) : [];
  if (height + (parentId ? parentAncestors.length + 1 : 0) > 16)
    return { kind: 'denied', reason: 'depth' };
  if (restorePosition !== undefined) {
    if (
      restorePosition !== null &&
      (!Number.isInteger(restorePosition) ||
        restorePosition < -2147483648 ||
        restorePosition > 2147483647)
    )
      return { kind: 'denied', reason: 'position' };
    return {
      kind: 'allowed',
      move: { parent_id: parentId, position: restorePosition },
    };
  }
  const targetSiblings = siblings(documents, parentId);
  if (targetSiblings.some((doc) => doc.position == null)) {
    const max = Math.max(
      -1024,
      ...targetSiblings.map((doc) => doc.position ?? -1024)
    );
    let position = max;
    const preparation = targetSiblings
      .filter((doc) => doc.position == null)
      .map((doc) => ({ id: doc.id, position: (position += 1024) }));
    if (position > 2147482623) return { kind: 'denied', reason: 'position' };
    const positions = new Map(
      preparation.map((item) => [item.id, item.position])
    );
    const normalized = documents.map((doc) =>
      positions.has(doc.id)
        ? { ...doc, position: positions.get(doc.id) ?? null }
        : doc
    );
    const result = preflightMove({
      documents: normalized,
      id,
      parentId,
      beforeId,
      canManage,
    });
    return result.kind === 'allowed'
      ? { ...result, preparation, previousPosition: positions.get(id) }
      : result;
  }
  const peers = targetSiblings.filter((doc) => doc.id !== id);
  const index =
    beforeId === null
      ? peers.length
      : peers.findIndex((doc) => doc.id === beforeId);
  if (index < 0) return { kind: 'denied', reason: 'missing' };
  const previous = peers[index - 1];
  const next = peers[index];
  let position: number;
  if (!previous) position = next?.position == null ? 0 : next.position - 1024;
  else if (previous.position == null)
    return { kind: 'denied', reason: 'position' };
  else if (next?.position == null) position = previous.position + 1024;
  else position = Math.floor((previous.position + next.position) / 2);
  if (
    !Number.isSafeInteger(position) ||
    position < -2147483648 ||
    position > 2147483647 ||
    (previous?.position != null && position <= previous.position) ||
    (next?.position != null && position >= next.position)
  )
    return { kind: 'denied', reason: 'position' };
  return { kind: 'allowed', move: { parent_id: parentId, position } };
}

export function keyboardMove({
  documents,
  id,
  direction,
  canManage,
}: {
  documents: readonly HierarchyDocument[];
  id: string;
  direction: KeyboardMove;
  canManage: boolean;
}): MoveResult {
  if (!canManage) return { kind: 'denied', reason: 'permission' };
  const document = documents.find((doc) => doc.id === id);
  if (!document) return { kind: 'denied', reason: 'missing' };
  const parentId = document.parent_id ?? null;
  const peers = siblings(documents, parentId);
  const index = peers.findIndex((doc) => doc.id === id);
  const previous = peers[index - 1];
  const next = peers[index + 1];
  const parent = documents.find((doc) => doc.id === parentId);
  if (
    ((direction === 'up' || direction === 'indent') && !previous) ||
    (direction === 'down' && !next) ||
    (direction === 'outdent' && !parent)
  )
    return { kind: 'denied', reason: 'missing' };
  return preflightMove({
    documents,
    id,
    canManage,
    parentId:
      direction === 'indent'
        ? (previous?.id ?? null)
        : direction === 'outdent'
          ? (parent?.parent_id ?? null)
          : parentId,
    beforeId:
      direction === 'up'
        ? previous?.id
        : direction === 'down'
          ? peers[index + 2]?.id
          : undefined,
  });
}

export const documentHierarchyQueryKey = (wsId: string) => [
  'document-hierarchy',
  wsId,
];
