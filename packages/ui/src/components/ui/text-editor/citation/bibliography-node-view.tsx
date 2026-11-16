'use client';

import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useId } from 'react';
import { CitationAttribution } from './citation-attribution';
import { useCitationContext } from './citation-context';
import { FormattedRuns } from './formatted-runs';
import { DEFAULT_CITATION_LABELS } from './labels';
import { normalizeCitationStyle } from './snapshot';
import { CITATION_STYLE_IDS, type CitationStyleId } from './types';

/** References derived from the document's citations; nothing is stored here. */
export function BibliographyNodeView({ node, editor }: NodeViewProps) {
  const context = useCitationContext();
  const styleId = useId();
  const labels = context?.labels ?? DEFAULT_CITATION_LABELS;
  const style = normalizeCitationStyle(node.attrs.style);
  const editable = Boolean(context) && editor.isEditable;

  const body = (() => {
    if (!context) return null;
    if (context.format.status === 'error') {
      return (
        <p role="alert" className="text-destructive text-sm">
          {labels.errorGeneric}
        </p>
      );
    }
    const entries = context.format.result.bibliography;
    if (entries.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          {labels.referencesEmpty}
        </p>
      );
    }
    return (
      <>
        <ul className="flex list-none flex-col gap-2 p-0">
          {entries.map((entry) => (
            <li
              key={entry.key}
              className="m-0 pl-8 -indent-8 text-sm leading-6"
            >
              {entry.runs?.length ? (
                <FormattedRuns runs={entry.runs} />
              ) : (
                entry.text
              )}
            </li>
          ))}
        </ul>
        <CitationAttribution labels={labels.attribution} />
      </>
    );
  })();

  return (
    <NodeViewWrapper
      as="section"
      contentEditable={false}
      data-citation-bibliography=""
      className="my-6 flex flex-col gap-3 border-border border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-semibold text-lg">{labels.references}</h2>
        {editable && context && (
          <div className="flex items-center gap-2">
            <label htmlFor={styleId} className="sr-only">
              {labels.style}
            </label>
            <Select
              value={style}
              onValueChange={(value) =>
                context.setStyle(value as CitationStyleId)
              }
            >
              <SelectTrigger id={styleId} className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CITATION_STYLE_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {labels.styles[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {body}
    </NodeViewWrapper>
  );
}
