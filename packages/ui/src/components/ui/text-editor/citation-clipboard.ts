import type { Node } from '@tiptap/pm/model';
import { citationFallbackText } from './citation/snapshot';
import type { FormattedDocumentCitations } from './citation/types';

/** Host-formatted document scope; the shared editor never imports an engine. */
export type CitationClipboardScope = Pick<
  FormattedDocumentCitations,
  'inText' | 'bibliography'
>;

export function citationClipboardText(
  node: Node,
  scope?: CitationClipboardScope
): string | null {
  if (node.type.name === 'citation') {
    const id: unknown = node.attrs.citationId;
    const formatted =
      typeof id === 'string' && scope && Object.hasOwn(scope.inText, id)
        ? scope.inText[id]
        : undefined;
    return typeof formatted === 'string' && formatted
      ? formatted
      : citationFallbackText(node.attrs);
  }
  if (node.type.name === 'citationBibliography') {
    return (
      scope?.bibliography.map((entry) => entry.text).join('\n\n') ||
      '(references)'
    );
  }
  return null;
}
