'use client';

import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';
import { CitationEditPanel, recoveryLabelKey } from './citation-edit-panel';
import {
  citationValidationLevel,
  resolveCitationRecovery,
  useCitationContext,
} from './citation-context';
import { RECOVERY_ATTENTION } from './label-keys';
import { citationFallbackText, readCitationAttrs } from './snapshot';

export function CitationNodeView({
  node,
  editor,
  selected,
  deleteNode,
  updateAttributes,
}: NodeViewProps) {
  const context = useCitationContext();
  const attrs = readCitationAttrs(node.attrs);
  const [open, setOpen] = useState(false);

  const inspection = useMemo(
    () => (context && attrs.snapshot ? context.inspect(attrs.snapshot) : null),
    [context, attrs.snapshot]
  );
  const recovery = context
    ? resolveCitationRecovery(attrs, inspection, context.library)
    : null;

  const formatted =
    context?.format.status === 'ok' && attrs.citationId
      ? context.format.result.inText[attrs.citationId]
      : undefined;
  const text = formatted ?? citationFallbackText(node.attrs);
  const validation = citationValidationLevel(inspection);
  const needsAttention =
    (recovery ? RECOVERY_ATTENTION.has(recovery.kind) : false) ||
    validation === 'error';

  const chip = (
    <span
      data-citation-recovery={recovery?.kind}
      data-citation-validation={validation ?? undefined}
      className={cn(
        'rounded-sm px-0.5 text-foreground decoration-1 underline-offset-4',
        needsAttention
          ? 'underline decoration-dynamic-orange decoration-wavy'
          : validation === 'warning'
            ? 'underline decoration-dynamic-orange decoration-dotted'
            : 'underline decoration-dynamic-border decoration-dotted',
        recovery?.kind === 'invalid' && 'decoration-destructive',
        selected && 'bg-dynamic-surface'
      )}
    >
      {text}
    </span>
  );

  if (!context || !editor.isEditable) {
    return <NodeViewWrapper as="span">{chip}</NodeViewWrapper>;
  }

  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={[
              `${context.labels.edit}: ${text}`,
              recovery && RECOVERY_ATTENTION.has(recovery.kind)
                ? context.labels.status[recoveryLabelKey(recovery.kind)]
                : null,
              validation ? context.labels.issuesHeading : null,
            ]
              .filter(Boolean)
              .join('. ')}
            className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {chip}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
          {recovery && (
            <CitationEditPanel
              attrs={attrs}
              inspection={inspection}
              recovery={recovery}
              onUpdate={updateAttributes}
              onRemove={() => {
                setOpen(false);
                deleteNode();
              }}
              onReplace={() => {
                if (!attrs.citationId) return;
                setOpen(false);
                context.openDrawer({
                  mode: 'replace',
                  citationId: attrs.citationId,
                });
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
