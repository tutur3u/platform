'use client';

import { AlertCircle, Check, ChevronRight, Loader2 } from '@tuturuuu/icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { getMiraToolName } from '../../mira-tool-part-utils';
import { humanizeToolName } from '../helpers';
import type { MessageRenderDescriptor } from '../resolve-message-render-groups';
import type { ToolPartData } from '../types';
import { GroupedToolCallParts } from './grouped-tool-call-parts';
import { ToolCallPart } from './tool-call-part';
import { getToolPartStatus } from './tool-status';

/** Tool names that render rich visual output and should NOT be collapsed. */
const VISUAL_TOOL_NAMES = new Set([
  'render_ui',
  'google_search',
  'create_image',
]);

/** Check if a single tool descriptor should render visually (not collapsed). */
export function isVisualToolDescriptor(
  descriptor: MessageRenderDescriptor
): boolean {
  if (descriptor.kind === 'tool') {
    const toolName = getToolNameFromPart(descriptor.part);
    return VISUAL_TOOL_NAMES.has(toolName);
  }
  if (descriptor.kind === 'tool-group') {
    return VISUAL_TOOL_NAMES.has(descriptor.toolName);
  }
  return false;
}

function getToolNameFromPart(part: ToolPartData): string {
  return getMiraToolName(part);
}

type CollapsibleDescriptor = Extract<
  MessageRenderDescriptor,
  { kind: 'tool' | 'tool-group' }
>;

function getPartCount(descriptors: CollapsibleDescriptor[]): number {
  let count = 0;
  for (const d of descriptors) {
    if (d.kind === 'tool') count += 1;
    else count += d.parts.length;
  }
  return count;
}

function getAggregateStatus(
  descriptors: CollapsibleDescriptor[]
): 'running' | 'done' | 'error' {
  let anyRunning = false;
  let anyError = false;

  for (const d of descriptors) {
    const parts = d.kind === 'tool' ? [d.part] : d.parts;
    for (const part of parts) {
      const { isDone, isError, isRunning } = getToolPartStatus(part);
      if (isRunning) anyRunning = true;
      if (isError) anyError = true;
      if (!isDone && !isError && !isRunning) anyRunning = true;
    }
  }

  if (anyRunning) return 'running';
  if (anyError) return 'error';
  return 'done';
}

/**
 * Get the display name of the most recently added tool in the collapsed batch.
 */
export function getLatestActionName(
  descriptors: CollapsibleDescriptor[]
): string {
  let lastName = '';

  for (const d of descriptors) {
    if (d.kind === 'tool') {
      const name = getToolNameFromPart(d.part);
      if (name) lastName = name;
    } else {
      if (d.toolName) lastName = d.toolName;
    }
  }

  return lastName ? humanizeToolName(lastName) : '';
}

export function CollapsibleToolSection({
  descriptors,
}: {
  descriptors: CollapsibleDescriptor[];
}) {
  const t = useTranslations('dashboard.mira_chat');
  const [open, setOpen] = useState(false);
  const count = getPartCount(descriptors);
  const status = getAggregateStatus(descriptors);
  const latestAction = getLatestActionName(descriptors);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
          'hover:bg-foreground/3',
          status === 'error'
            ? 'border-dynamic-red/20 bg-dynamic-red/5'
            : 'border-border/50 bg-foreground/2'
        )}
      >
        <span className="shrink-0">
          {status === 'running' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : status === 'error' ? (
            <AlertCircle className="h-3.5 w-3.5 text-dynamic-red" />
          ) : (
            <Check className="h-3.5 w-3.5 text-dynamic-green" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
          {status === 'running'
            ? t('tool_section_running', { count })
            : status === 'error'
              ? t('tool_section_error', { count })
              : t('tool_section_done', { count })}
          {latestAction && (
            <span className="ml-1.5 font-normal opacity-60">
              {'· '}
              {latestAction}
            </span>
          )}
        </span>
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-col gap-1">
        {descriptors.map((descriptor) => {
          if (descriptor.kind === 'tool') {
            return (
              <ToolCallPart
                key={descriptor.key}
                part={descriptor.part}
                renderUiFailure={descriptor.renderUiFailure}
              />
            );
          }
          if (descriptor.kind === 'tool-group') {
            return (
              <GroupedToolCallParts
                key={descriptor.key}
                parts={descriptor.parts}
                toolName={descriptor.toolName}
              />
            );
          }
          return null;
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
