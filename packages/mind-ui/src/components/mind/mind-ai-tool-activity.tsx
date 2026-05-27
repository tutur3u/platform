'use client';

import {
  Check,
  ChevronDown,
  CircleAlert,
  FileJson,
  ListChecks,
  LoaderCircle,
  Sparkles,
  Wrench,
} from '@tuturuuu/icons';
import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { getMindAiPatchRecord } from './mind-ai-proposal-island';
import { resolveMindRenderUiSpec } from './mind-json-render-spec';

type MessagePart = UIMessage['parts'][number];
type ToolStatus = 'done' | 'error' | 'running';
type PendingVisualArtifact = {
  id: string;
  visual: unknown;
};

export function MindAiToolActivity({
  applying,
  isStreaming,
  onApplyPatch,
  onOpenArtifact,
  patches,
  parts,
}: {
  applying?: boolean;
  isStreaming: boolean;
  onApplyPatch?: (patchId: string) => void;
  onOpenArtifact?: (artifact: MindAiArtifactItem) => void;
  patches?: MindAiPatchRecord[];
  parts: MessagePart[];
}) {
  const t = useTranslations('mind');
  const activity = parts.map((part) => ({
    name: getToolName(part),
    part,
    status: getToolStatus(part, isStreaming),
  }));
  const errorCount = activity.filter((item) => item.status === 'error').length;
  const runningCount = activity.filter(
    (item) => item.status === 'running'
  ).length;
  const doneCount = activity.filter((item) => item.status === 'done').length;
  const artifacts = getToolArtifacts(parts, patches ?? []);
  const latestActivity = activity.at(-1);
  const latestArtifact = artifacts.at(-1);

  return (
    <div className="space-y-2">
      <details
        className={cn(
          'group rounded-md border bg-background/60',
          runningCount > 0
            ? 'border-dynamic-blue/30 bg-dynamic-blue/5'
            : 'border-border'
        )}
      >
        <summary className="cursor-pointer list-none marker:hidden">
          <ToolActivitySummary
            activityCount={activity.length}
            doneCount={doneCount}
            errorCount={errorCount}
            latestName={latestActivity?.name}
            latestStatus={latestActivity?.status}
            runningCount={runningCount}
            trailingIcon={
              <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
            }
          />
        </summary>
        <ToolRows activity={activity} />
      </details>
      {artifacts.length ? (
        <details className="group rounded-md border border-border bg-background/60">
          <summary className="cursor-pointer list-none marker:hidden">
            <ArtifactSummary
              count={artifacts.length}
              latestName={getArtifactLabel(latestArtifact, t)}
              trailingIcon={
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
              }
            />
          </summary>
          <ArtifactRows
            applying={applying}
            artifacts={artifacts}
            onApplyPatch={onApplyPatch}
            onOpenArtifact={onOpenArtifact}
          />
        </details>
      ) : null}
    </div>
  );
}

function ToolActivitySummary({
  activityCount,
  doneCount,
  errorCount,
  latestName,
  latestStatus,
  runningCount,
  trailingIcon,
}: {
  activityCount: number;
  doneCount: number;
  errorCount: number;
  latestName?: string;
  latestStatus?: ToolStatus;
  runningCount: number;
  trailingIcon?: ReactNode;
}) {
  const t = useTranslations('mind');
  const SummaryIcon =
    latestStatus === 'running'
      ? LoaderCircle
      : latestStatus === 'error'
        ? CircleAlert
        : Wrench;

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-muted-foreground text-xs">
      <span className="flex min-w-0 items-center gap-1.5">
        <SummaryIcon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            latestStatus === 'running' && 'animate-spin text-dynamic-blue',
            latestStatus === 'error' && 'text-dynamic-red'
          )}
        />
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {t('ai.toolSummary', { count: activityCount })}
          </span>
          {latestName ? (
            <span className="block truncate text-[10px]">{latestName}</span>
          ) : null}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <ToolCount
          className="text-muted-foreground"
          count={activityCount}
          icon={Wrench}
          label={t('ai.toolAttempted')}
        />
        <ToolCount
          className="text-dynamic-green"
          count={doneCount}
          icon={Check}
          label={t('ai.toolSuccessful')}
        />
        {errorCount > 0 ? (
          <ToolCount
            className="text-dynamic-red"
            count={errorCount}
            icon={CircleAlert}
            label={t('ai.toolErrors')}
          />
        ) : null}
        {runningCount > 0 ? (
          <ToolCount
            className="text-dynamic-blue"
            count={runningCount}
            icon={LoaderCircle}
            label={t('ai.toolRunning')}
          />
        ) : null}
        {trailingIcon}
      </span>
    </div>
  );
}

function ArtifactSummary({
  count,
  latestName,
  trailingIcon,
}: {
  count: number;
  latestName?: string;
  trailingIcon?: ReactNode;
}) {
  const t = useTranslations('mind');

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-muted-foreground text-xs">
      <span className="flex min-w-0 items-center gap-1.5">
        <FileJson className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {t('ai.artifactSummary', { count })}
          </span>
          {latestName ? (
            <span className="block truncate text-[10px]">{latestName}</span>
          ) : null}
        </span>
      </span>
      {trailingIcon}
    </div>
  );
}

function ToolRows({
  activity,
}: {
  activity: Array<{
    name: string;
    part: MessagePart;
    status: ToolStatus;
  }>;
}) {
  return (
    <div className="space-y-1 border-border border-t p-1.5">
      {activity.map((item, index) => (
        <ToolPartRow
          item={item}
          key={`${getToolDebugValue(item.part, 'toolCallId')}-${item.name}-${index}`}
        />
      ))}
    </div>
  );
}

function ArtifactRows({
  applying,
  artifacts,
  onApplyPatch,
  onOpenArtifact,
}: {
  applying?: boolean;
  artifacts: MindAiArtifactItem[];
  onApplyPatch?: (patchId: string) => void;
  onOpenArtifact?: (artifact: MindAiArtifactItem) => void;
}) {
  return (
    <div className="grid gap-1 border-border border-t p-1.5">
      {artifacts.map((artifact) => (
        <MindAiArtifactRow
          applying={applying}
          artifact={artifact}
          key={artifact.id}
          onApplyPatch={onApplyPatch}
          onOpenArtifact={onOpenArtifact}
        />
      ))}
    </div>
  );
}

export type MindAiArtifactItem = {
  id: string;
  patch?: MindAiPatchRecord;
  title: string;
  type: 'proposal';
  visual?: unknown;
};

function MindAiArtifactRow({
  applying,
  artifact,
  onApplyPatch,
  onOpenArtifact,
}: {
  applying?: boolean;
  artifact: MindAiArtifactItem;
  onApplyPatch?: (patchId: string) => void;
  onOpenArtifact?: (artifact: MindAiArtifactItem) => void;
}) {
  const t = useTranslations('mind');
  const Icon = artifact.patch ? ListChecks : Sparkles;
  const label = artifact.title || t('ai.artifactPlan');
  const canApply = artifact.patch?.status === 'draft';
  const isApplied = artifact.patch?.status === 'applied';

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card/70 p-1.5 text-xs">
      <button
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left transition hover:bg-muted/60"
        onClick={() => onOpenArtifact?.(artifact)}
        type="button"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium">{label}</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {artifact.patch
              ? t('ai.pendingDraftProposal')
              : t('ai.openArtifactPlan')}
          </span>
        </span>
      </button>
      {canApply ? (
        <Button
          className="shrink-0 rounded border border-border px-2 py-1 font-medium text-[10px] hover:bg-background"
          disabled={applying}
          onClick={(event) => {
            event.stopPropagation();
            if (artifact.patch) onApplyPatch?.(artifact.patch.id);
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t('ai.applyDraft')}
        </Button>
      ) : isApplied ? (
        <Badge className="shrink-0 text-[10px]" variant="outline">
          {t('ai.applied')}
        </Badge>
      ) : null}
    </div>
  );
}

function ToolCount({
  className,
  count,
  icon: Icon,
  label,
}: {
  className?: string;
  count: number;
  icon: typeof Wrench;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded border border-border/70 px-1.5 font-medium text-[10px]',
        className
      )}
      title={`${count} ${label}`}
    >
      <Icon className="h-3 w-3" />
      {count}
    </span>
  );
}

function ToolPartRow({
  item,
}: {
  item: {
    name: string;
    part: MessagePart;
    status: ToolStatus;
  };
}) {
  const t = useTranslations('mind');
  const Icon =
    item.status === 'done'
      ? Check
      : item.status === 'error'
        ? CircleAlert
        : LoaderCircle;
  const state = getToolDebugValue(item.part, 'state');
  const errorText =
    getToolDebugValue(item.part, 'errorText') ??
    getMindToolFailureReason(item.part);
  const toolCallId = getToolDebugValue(item.part, 'toolCallId');

  return (
    <div className="rounded border border-border/70 bg-card/70 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            item.status === 'running' && 'animate-spin',
            item.status === 'error' && 'text-dynamic-red'
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {item.name}
        </span>
        <Badge
          className={cn(
            'h-5 rounded px-1.5 font-normal text-[10px]',
            item.status === 'error' && 'border-dynamic-red/40 text-dynamic-red'
          )}
          variant="outline"
        >
          {t(`ai.toolStatus.${item.status}`)}
        </Badge>
      </div>
      <div className="mt-1 grid gap-0.5 text-[10px] text-muted-foreground">
        {state ? (
          <span className="truncate">
            {t('ai.toolState')}: {state}
          </span>
        ) : null}
        {toolCallId ? (
          <span className="truncate">
            {t('ai.toolCallId')}: {toolCallId}
          </span>
        ) : null}
        {errorText ? (
          <span className="break-words text-dynamic-red">{errorText}</span>
        ) : null}
      </div>
    </div>
  );
}

function getToolName(part: MessagePart) {
  const record = part as { toolName?: unknown; type?: unknown };
  if (typeof record.toolName === 'string') return record.toolName;
  if (typeof record.type !== 'string') return 'tool';
  return record.type.replace(/^tool-/, '').replace(/^dynamic-/, '');
}

export function getToolArtifacts(
  parts: MessagePart[],
  patches: MindAiPatchRecord[]
): MindAiArtifactItem[] {
  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  const artifacts: MindAiArtifactItem[] = [];
  let pendingVisual: PendingVisualArtifact | undefined;

  for (const [index, part] of parts.entries()) {
    const name = getToolName(part);
    const toolCallId =
      getToolDebugValue(part, 'toolCallId') ?? `${name}-${index}`;

    if (name === 'render_mind_ui') {
      const visual = getToolOutput(part) ?? getToolRawInput(part);
      if (!resolveMindRenderUiSpec(visual)) continue;

      pendingVisual = {
        id: `plan-${toolCallId}`,
        visual,
      };
      continue;
    }

    if (name === 'propose_mind_patch') {
      const patch = getMindAiPatchRecord(getToolOutput(part));
      if (!patch) continue;
      const currentPatch = patchById.get(patch.id) ?? patch;

      artifacts.push({
        id: [pendingVisual?.id, `patch-${currentPatch.id}`]
          .filter(Boolean)
          .join(':'),
        patch: currentPatch,
        title: currentPatch.summary,
        type: 'proposal',
        visual: pendingVisual?.visual,
      });
      pendingVisual = undefined;
    }
  }

  if (pendingVisual !== undefined) {
    const visualArtifact = pendingVisual;
    artifacts.push({
      id: visualArtifact.id,
      title: '',
      type: 'proposal',
      visual: visualArtifact.visual,
    });
  }

  return artifacts;
}

function getArtifactLabel(
  artifact: MindAiArtifactItem | undefined,
  t: ReturnType<typeof useTranslations>
) {
  if (!artifact) return undefined;
  return artifact.title || t('ai.artifactPlan');
}

function getToolOutput(part: MessagePart) {
  return (part as Record<string, unknown>).output;
}

function getToolRawInput(part: MessagePart) {
  return (part as Record<string, unknown>).rawInput;
}

function getToolStatus(part: MessagePart, isStreaming: boolean): ToolStatus {
  const record = part as {
    errorText?: unknown;
    state?: unknown;
    type?: unknown;
  };
  if (typeof record.errorText === 'string' && record.errorText) return 'error';
  if (getMindToolFailureReason(part)) return 'error';
  if (record.state === 'output-error' || record.state === 'output-denied') {
    return 'error';
  }
  if (record.state === 'output-available') return 'done';
  if (isStreaming) return 'running';
  return 'done';
}

function getToolDebugValue(part: MessagePart, key: string) {
  const value = (part as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : null;
}

export function getMindToolFailureReason(part: UIMessage['parts'][number]) {
  const output = getToolOutput(part);
  if (!isRecord(output) || output.ok !== false) return null;

  for (const key of ['reason', 'error', 'message', 'warning']) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return 'Tool returned an unsuccessful result.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
