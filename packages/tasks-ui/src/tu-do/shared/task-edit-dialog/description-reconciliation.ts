import type { Editor, JSONContent } from '@tiptap/react';
import type { RecoverableTaskDescriptionVersion } from './description-versions';
import { normalizeTaskDescriptionSnapshot } from './utils';

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

// Schema comparison may fill defaults, but must never discard an unknown
// attribute or unsupported node/mark and call the result equivalent.
function isSupportedContent(
  content: JSONContent,
  schema: Editor['schema']
): boolean {
  const type = content.type ? schema.nodes[content.type] : undefined;
  if (!type || (content.type !== 'text' && content.text !== undefined))
    return false;
  if (
    Object.keys(content).some(
      (key) => !['type', 'attrs', 'content', 'marks', 'text'].includes(key)
    )
  )
    return false;
  if (
    Object.keys(content.attrs ?? {}).some(
      (key) => !(key in (type.spec.attrs ?? {}))
    )
  )
    return false;
  if (
    content.marks?.some((mark) => {
      const markType = schema.marks[mark.type];
      return (
        !markType ||
        Object.keys(mark).some((key) => !['type', 'attrs'].includes(key)) ||
        Object.keys(mark.attrs ?? {}).some(
          (key) => !(key in (markType.spec.attrs ?? {}))
        )
      );
    })
  )
    return false;
  return (
    content.content?.every((child) => isSupportedContent(child, schema)) ?? true
  );
}

export function areTaskDescriptionsEquivalent(
  left: JSONContent | null,
  right: JSONContent | null,
  schema?: Editor['schema']
): boolean {
  const a = normalizeTaskDescriptionSnapshot(left);
  const b = normalizeTaskDescriptionSnapshot(right);
  if (!a || !b) return a === b;
  if (stableValue(a) === stableValue(b)) return true;
  if (
    !schema ||
    !isSupportedContent(a, schema) ||
    !isSupportedContent(b, schema)
  )
    return false;
  try {
    const nodeA = schema.nodeFromJSON(a);
    const nodeB = schema.nodeFromJSON(b);
    nodeA.check();
    nodeB.check();
    return nodeA.eq(nodeB);
  } catch {
    return false;
  }
}

/** Reconcile recovery metadata only. Never write history content into the editor. */
export function getTaskDescriptionRecoveryVersion({
  versions,
  currentContent,
  persistedContent,
  baselineContent,
  confirmedSavedContent,
  isSettling,
  schema,
}: {
  versions: RecoverableTaskDescriptionVersion[];
  currentContent: JSONContent | null;
  persistedContent: JSONContent | null;
  baselineContent?: JSONContent;
  confirmedSavedContent?: JSONContent | null;
  isSettling: boolean;
  schema?: Editor['schema'];
}): RecoverableTaskDescriptionVersion | null {
  const latest = versions[0];
  if (!latest || isSettling) return null;
  if (areTaskDescriptionsEquivalent(currentContent, latest.content, schema))
    return null;
  if (
    latest.reason === 'tracked' &&
    confirmedSavedContent !== undefined &&
    areTaskDescriptionsEquivalent(confirmedSavedContent, latest.content, schema)
  )
    return null;
  // Local edits can differ from history even though that version is already
  // the current server snapshot AND the hydrated editor baseline. A divergent
  // Yjs baseline must remain available for comparison.
  if (
    latest.reason === 'tracked' &&
    baselineContent !== undefined &&
    areTaskDescriptionsEquivalent(baselineContent, latest.content, schema) &&
    areTaskDescriptionsEquivalent(persistedContent, latest.content, schema)
  )
    return null;
  return latest;
}
