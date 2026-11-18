'use client';

import { AudioLines, Check, MessageSquare, Sparkles, X } from '@tuturuuu/icons';
import type { MeetProgrammingMiraAction } from '@tuturuuu/internal-api/meet-call';
import type { ProgrammingMiraPresence } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export type WorkbenchMira = {
  presence: ProgrammingMiraPresence | null;
  voiceDraft?: {
    id: string;
    answer: { explanation: string; replacement: string | null } | null;
  } | null;
  mark?: ReactNode;
  manage: boolean;
  pending: boolean;
  error?: 'consent' | 'live' | 'conflict' | 'unavailable';
  onAction: (action: MeetProgrammingMiraAction) => void;
};

const errorLabels = {
  consent: 'miraConsentRequired',
  live: 'miraLiveRequired',
  conflict: 'miraFixConflict',
  unavailable: 'miraUnavailable',
} as const;

const pill =
  'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-dynamic-purple/30 px-2 py-1 font-bold text-dynamic-purple text-xs';

export function MiraFileBadge({
  label,
  mark,
}: {
  label: string;
  mark?: ReactNode;
}) {
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className="relative inline-grid size-4 shrink-0 place-items-center rounded-full bg-calendar-bg-purple text-dynamic-purple before:absolute before:inset-0 before:animate-ping before:rounded-full before:border before:border-current motion-reduce:before:animate-none"
    >
      {mark ?? <Sparkles className="size-3" aria-hidden="true" />}
    </span>
  );
}

export function useMiraCodeLabels(presence?: ProgrammingMiraPresence) {
  const t = useTranslations('programmingPlayground');
  const mode = presence
    ? t(presence.source === 'live' ? 'miraLive' : 'miraChat')
    : '';
  const hasRange =
    presence?.startLine !== undefined && presence.endLine !== undefined;
  const range = {
    start: presence?.startLine ?? 1,
    end: presence?.endLine ?? 1,
  };
  const attribution =
    presence?.proposedFix?.status === 'accepted'
      ? t('miraAccepted', { mode, name: presence.proposedFix.acceptedBy ?? '' })
      : presence?.statusText && !presence.proposedFix && hasRange
        ? t(
            presence.source === 'live'
              ? 'miraVoiceExplained'
              : 'miraChatExplained',
            range
          )
        : undefined;
  return {
    mode,
    attribution,
    caret: presence ? t('miraCaret', { mode }) : '',
    checking: hasRange ? t('miraChecking', range) : undefined,
  };
}

export function MiraEditorBar({
  mira,
  presence,
  onAnalyze,
  editable,
}: {
  mira: WorkbenchMira;
  presence?: ProgrammingMiraPresence;
  onAnalyze: (source: 'chat' | 'live', intent: 'explain' | 'fix') => void;
  editable: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  const labels = useMiraCodeLabels(presence);
  const draft = mira.voiceDraft;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-muted/25 px-2 py-1">
      {(presence?.active || presence?.proposedFix?.status === 'proposed') &&
        !labels.attribution &&
        labels.checking && (
          <span role="status" className={`${pill} bg-calendar-bg-purple`}>
            <span className="size-2 shrink-0 animate-pulse rounded-full border border-current bg-current motion-reduce:animate-none motion-reduce:bg-transparent" />
            <span className="truncate">{labels.checking}</span>
          </span>
        )}
      {labels.attribution && (
        <span className={`${pill} bg-card`}>
          {mira.mark}
          {presence?.source === 'live' ? (
            <AudioLines className="size-3 shrink-0" />
          ) : (
            <MessageSquare className="size-3 shrink-0" />
          )}
          <span>{labels.attribution}</span>
        </span>
      )}
      {mira.manage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="ml-auto h-7 rounded-full motion-reduce:transition-none"
              size="sm"
              variant="outline"
              disabled={
                !editable ||
                mira.pending ||
                !!draft ||
                mira.presence?.proposedFix?.status === 'proposed'
              }
            >
              {mira.mark ?? <Sparkles className="size-3.5" />}
              {t('miraReview')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onAnalyze('chat', 'explain')}>
              <MessageSquare className="size-4" /> {t('miraExplainChat')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAnalyze('chat', 'fix')}>
              <MessageSquare className="size-4" /> {t('miraFixChat')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAnalyze('live', 'explain')}>
              <AudioLines className="size-4" /> {t('miraExplainLive')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAnalyze('live', 'fix')}>
              <AudioLines className="size-4" /> {t('miraFixLive')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {mira.error && (
        <p role="alert" className="w-full text-destructive text-xs">
          {t(errorLabels[mira.error])}
        </p>
      )}
    </div>
  );
}

export function MiraCodeReview({
  mira,
  presence,
  editable,
}: {
  mira: WorkbenchMira;
  presence?: ProgrammingMiraPresence;
  editable: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  const labels = useMiraCodeLabels(presence);
  const fix = presence?.proposedFix;
  const draft = mira.voiceDraft;
  if (draft && mira.manage) {
    return (
      <section
        aria-label={t('miraVoiceDraft')}
        className="mx-2 mb-2 max-h-44 shrink-0 overflow-auto rounded-[var(--radius)] border bg-card p-2 text-sm"
      >
        <p role="status" className="font-semibold text-dynamic-purple">
          {t(draft.answer ? 'miraVoiceDraft' : 'miraAskVoice')}
        </p>
        {draft.answer && (
          <>
            <p className="whitespace-pre-wrap break-words text-xs">
              {draft.answer.explanation}
            </p>
            {draft.answer.replacement !== null && (
              <pre className="overflow-auto whitespace-pre-wrap break-words bg-calendar-bg-green p-1 font-mono text-dynamic-green text-xs">
                {draft.answer.replacement}
              </pre>
            )}
          </>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={mira.pending}
            onClick={() => mira.onAction({ action: 'cancel', id: draft.id })}
          >
            {t('miraDismiss')}
          </Button>
          {draft.answer && (
            <Button
              size="sm"
              disabled={mira.pending}
              onClick={() => mira.onAction({ action: 'publish', id: draft.id })}
            >
              {t('miraShareDraft')}
            </Button>
          )}
        </div>
      </section>
    );
  }
  if (!presence || (!presence.statusText && !fix)) return null;
  if (fix && fix.status !== 'proposed') return null;
  return (
    <section
      aria-label={t(fix ? 'miraProposed' : 'miraExplanation', {
        mode: labels.mode,
      })}
      className="mx-2 mb-2 max-h-48 shrink-0 overflow-auto rounded-[var(--radius-xl)] border border-dynamic-purple/30 bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-1.5 bg-calendar-bg-purple px-2 py-1.5 font-bold text-dynamic-purple text-xs">
        {mira.mark ?? <Sparkles className="size-3.5" />}
        {t(fix ? 'miraProposed' : 'miraExplanation', { mode: labels.mode })}
        {fix && (
          <span className="ml-auto rounded-full border border-current/25 bg-card px-2 py-0.5">
            {t('miraSuggestOnly')}
          </span>
        )}
      </div>
      {fix && (
        <div aria-label={t('miraDiff')} className="font-mono text-xs">
          <pre className="overflow-auto whitespace-pre-wrap break-words bg-calendar-bg-red px-2 py-1 text-dynamic-red">
            <span aria-hidden="true">− </span>
            {fix.original}
          </pre>
          <pre className="overflow-auto whitespace-pre-wrap break-words bg-calendar-bg-green px-2 py-1 text-dynamic-green">
            <span aria-hidden="true">+ </span>
            {fix.replacement}
          </pre>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-muted-foreground text-xs">
          {fix?.explanation ?? presence.statusText}
        </p>
        {fix && mira.manage && (
          <div className="ml-auto flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!editable || mira.pending}
              onClick={() =>
                mira.onAction({
                  action: 'resolve',
                  id: fix.id,
                  decision: 'dismissed',
                })
              }
            >
              <X className="size-3.5" /> {t('miraDismiss')}
            </Button>
            <Button
              size="sm"
              className="bg-calendar-bg-green text-dynamic-green hover:bg-calendar-bg-green/80"
              disabled={!editable || mira.pending}
              onClick={() =>
                mira.onAction({
                  action: 'resolve',
                  id: fix.id,
                  decision: 'accepted',
                })
              }
            >
              <Check className="size-3.5" /> {t('miraAccept')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
