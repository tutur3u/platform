'use client';

import { GitMerge, ListChecks, Sparkles, X } from '@tuturuuu/icons';
import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { MindAiPatchDraftCard } from './mind-ai-patch-draft-card';
import { resolveMindRenderUiSpec } from './mind-json-render-spec';
import { MindJsonRenderer } from './mind-json-renderer';

type MessagePart = UIMessage['parts'][number];

export type MindAiProposal = {
  id: string;
  patch?: MindAiPatchRecord;
  visual?: unknown;
};

type Props = {
  applying?: boolean;
  fullscreen?: boolean;
  proposal: MindAiProposal | null;
  onApplyPatch: (patchId: string) => void;
  onDismiss: (proposalId: string) => void;
};

export function MindAiProposalIsland({
  applying,
  fullscreen,
  proposal,
  onApplyPatch,
  onDismiss,
}: Props) {
  const t = useTranslations('mind');
  if (!proposal) return null;
  const canApply = proposal.patch?.status === 'draft';
  const isApplied = proposal.patch?.status === 'applied';
  const statusLabel = canApply
    ? t('ai.pendingApproval')
    : isApplied
      ? t('ai.applied')
      : proposal.patch
        ? proposal.patch.status
        : t('ai.proposalPlan');

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/10 backdrop-blur',
        fullscreen
          ? 'fixed top-20 right-8 bottom-24 z-[60]'
          : 'absolute top-20 bottom-5 z-40 hidden xl:flex'
      )}
      style={
        fullscreen
          ? { width: 'min(34rem, calc(100vw - 4rem))' }
          : {
              right: '30rem',
              width: 'min(34rem, calc(100vw - 34rem))',
            }
      }
    >
      <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="h-4 w-4 shrink-0 text-dynamic-blue" />
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-sm">
              {proposal.patch?.summary ?? t('ai.proposalTitle')}
            </h2>
            <p className="truncate text-muted-foreground text-xs">
              {proposal.patch
                ? t('ai.centralDraftProposal')
                : t('ai.proposalPlan')}
            </p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Badge variant={canApply ? 'secondary' : 'outline'}>
            {statusLabel}
          </Badge>
        </div>
        <Button
          aria-label={t('ai.hideProposal')}
          className="h-8 w-8"
          onClick={() => onDismiss(proposal.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {proposal.visual && !proposal.patch ? (
          <section className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-muted-foreground text-xs">
              <Sparkles className="h-3.5 w-3.5 text-dynamic-blue" />
              <span>{t('ai.proposalPlan')}</span>
            </div>
            <MindJsonRenderer output={proposal.visual} />
          </section>
        ) : null}
        {proposal.patch ? (
          <MindAiPatchDraftCard
            applying={applying}
            onApplyPatch={onApplyPatch}
            patch={proposal.patch}
            showApplyAction={false}
          />
        ) : null}
      </div>
      {proposal.patch && canApply ? (
        <div className="border-border border-t bg-background/95 p-2.5">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/70 px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">
                {t('ai.awaitingApproval')}
              </p>
              <p className="truncate text-muted-foreground text-xs">
                {t('ai.patchOps', {
                  count: proposal.patch.patch.operations.length,
                })}
              </p>
            </div>
            <Button
              className="shrink-0 gap-1.5"
              disabled={applying}
              onClick={() => {
                if (proposal.patch) onApplyPatch(proposal.patch.id);
              }}
              size="sm"
              type="button"
            >
              <GitMerge className="h-3.5 w-3.5" />
              {t('ai.applyDraft')}
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function getLatestMindAiProposal(
  messages: UIMessage[],
  patches: MindAiPatchRecord[]
): MindAiProposal | null {
  const patchIds = new Set<string>();
  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  let latestPatch: MindAiPatchRecord | undefined;
  let latestPatchId: string | undefined;
  let latestVisual: unknown;
  let latestVisualId: string | undefined;

  for (const message of messages) {
    for (const [partIndex, part] of message.parts.entries()) {
      const name = getToolName(part);
      const toolCallId =
        getToolValue(part, 'toolCallId') ?? `${message.id}-${partIndex}`;

      if (name === 'render_mind_ui') {
        const visual = getToolOutput(part) ?? getToolRawInput(part);
        if (resolveMindRenderUiSpec(visual)) {
          latestVisual = visual;
          latestVisualId = `visual-${toolCallId}`;
        }
      }

      if (name === 'propose_mind_patch') {
        const patch = getMindAiPatchRecord(getToolOutput(part));
        if (patch && !patchIds.has(patch.id)) {
          patchIds.add(patch.id);
          latestPatch = patchById.get(patch.id) ?? patch;
          latestPatchId = `patch-${patch.id}`;
        }
      }
    }
  }

  for (const patch of patches) {
    if (patch.status !== 'draft' || patchIds.has(patch.id)) continue;
    patchIds.add(patch.id);
    latestPatch = patch;
    latestPatchId = `patch-${patch.id}`;
  }

  if (!latestPatch) return null;

  return {
    id: [latestVisualId, latestPatchId].filter(Boolean).join(':'),
    patch: latestPatch,
    visual: latestVisual,
  };
}

export function hasMindAiProposalPart(message: UIMessage) {
  return message.parts.some((part) => {
    const name = getToolName(part);
    if (name === 'render_mind_ui') {
      return Boolean(
        resolveMindRenderUiSpec(getToolOutput(part) ?? getToolRawInput(part))
      );
    }

    if (name === 'propose_mind_patch') {
      return Boolean(getMindAiPatchRecord(getToolOutput(part)));
    }

    return false;
  });
}

function getToolName(part: MessagePart) {
  const record = part as { toolName?: unknown; type?: unknown };
  if (typeof record.toolName === 'string') return record.toolName;
  if (typeof record.type !== 'string') return 'tool';
  return record.type.replace(/^tool-/, '').replace(/^dynamic-/, '');
}

function getToolValue(part: MessagePart, key: string) {
  const value = (part as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : null;
}

function getToolOutput(part: MessagePart) {
  return (part as Record<string, unknown>).output;
}

function getToolRawInput(part: MessagePart) {
  return (part as Record<string, unknown>).rawInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getMindAiPatchRecord(
  output: unknown
): MindAiPatchRecord | null {
  if (!isRecord(output)) return null;
  const patch = output.patch;
  if (!isRecord(patch)) return null;
  if (typeof patch.id !== 'string') return null;
  if (!isRecord(patch.patch)) return null;
  if (!Array.isArray(patch.patch.operations)) return null;

  return patch as unknown as MindAiPatchRecord;
}
