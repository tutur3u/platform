'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Flag,
  Gamepad2,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { QuizArenaFullView } from '@tuturuuu/realtime/meet/room-quiz-arena';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  notifyQuizArenaMutation,
  quizArenaExportUrl,
  quizArenaKey,
  sendQuizArenaAction,
  type useCallQuizArena,
} from '../lib/quiz-arena-client';
import type {
  QuizArenaAction,
  QuizArenaActionResult,
} from '../server/quiz-arena';
import { ControlButton } from './control-bar';
import { QuizArenaBoard } from './quiz-arena-board';
import { QuizArenaBuilder } from './quiz-arena-builder';
import { QuizArenaHostControls } from './quiz-arena-host-controls';
import { MiraAttribution, MiraStatus, Pill } from './quiz-arena-kit';
import { QuizArenaLeaderboard } from './quiz-arena-leaderboard';
import { QuizArenaQuestion } from './quiz-arena-question';
import { useQuizArenaSounds } from './quiz-arena-sounds';
import { ResizableCallPanel } from './resizable-call-panel';

type ArenaQuery = ReturnType<typeof useCallQuizArena>;
const LIVE_PHASES = new Set(['question', 'final_wager', 'final_answer']);

export function QuizArenaControl({
  query,
  open,
  onClick,
}: {
  query: ArenaQuery;
  open: boolean;
  onClick: () => void;
}) {
  const t = useTranslations('meet.call.quizArena');
  const live =
    query.data?.kind === 'full' && LIVE_PHASES.has(query.data.meta.phase);
  return (
    <ControlButton
      active={open}
      attention={live && !open}
      icon={Gamepad2}
      label={live ? t('live_indicator') : t('title')}
      onClick={onClick}
    />
  );
}

function errorKey(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === 'upskii_empty' ||
    code === 'upskii_forbidden' ||
    code === 'upskii_not_found'
    ? code
    : 'action_error';
}

export function QuizArenaPanel({
  accountId,
  meetingId,
  query,
  onClose,
}: {
  accountId: string;
  meetingId: string;
  query: ArenaQuery;
  onClose: () => void;
}) {
  const t = useTranslations('meet.call.quizArena');
  const locale = useLocale() === 'vi' ? 'vi' : 'en';
  const queryClient = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [miraUnavailable, setMiraUnavailable] = useState(false);
  const [courses, setCourses] = useState<NonNullable<
    QuizArenaActionResult['courses']
  > | null>(null);
  const view = query.data;
  const sounds = useQuizArenaSounds(view?.kind === 'full' ? view : undefined);
  const mutation = useMutation({
    mutationFn: (action: QuizArenaAction) =>
      sendQuizArenaAction(meetingId, action),
    onMutate: (action) => {
      if (action.action === 'mira_generate_board') setMiraUnavailable(false);
    },
    onSuccess: (result, action) => {
      if (action.action === 'list_upskii') {
        setCourses(result.courses ?? []);
        return;
      }
      if (action.action === 'mira_generate_board' && result.ok === false) {
        setMiraUnavailable(true);
        return;
      }
      if (action.action === 'buzz') sounds.buzz();
      if (
        action.action === 'mira_generate_board' ||
        action.action === 'import_upskii'
      )
        setBuilderOpen(false);
      notifyQuizArenaMutation(meetingId);
      return queryClient.invalidateQueries({
        queryKey: quizArenaKey(meetingId, accountId),
      });
    },
  });
  const busy = mutation.isPending;
  const act = mutation.mutate;
  const full: QuizArenaFullView | null = view?.kind === 'full' ? view : null;
  const canManage = view?.canManage ?? false;
  const showBuilder = canManage && (view?.kind === 'empty' || builderOpen);
  const meta = full?.meta;
  const active = full
    ? (full.tiles.find(({ id }) => id === meta?.activeTileId) ??
      (full.finalTile &&
      (full.finalTile.status === 'active' || meta?.phase === 'ended')
        ? full.finalTile
        : undefined) ??
      full.tiles.filter(({ status }) => status === 'revealed').at(-1))
    : undefined;
  return (
    <ResizableCallPanel label={t('title')}>
      <header className="flex flex-wrap items-center gap-1.5 border-border border-b px-3 py-2">
        <h2 className="font-extrabold text-foreground">{t('title')}</h2>
        {meta && (
          <>
            <Pill>
              {meta.answerMode === 'buzz_in' ? (
                <Zap aria-hidden />
              ) : (
                <Users aria-hidden />
              )}
              {meta.answerMode === 'buzz_in'
                ? t('mode_buzz_in')
                : t('mode_all_answer')}
            </Pill>
            <Pill>
              {meta.playMode === 'teams'
                ? t('mode_teams')
                : t('mode_individual')}
            </Pill>
            {meta.finalCategory && (
              <Pill
                className={
                  meta.phase.startsWith('final')
                    ? 'bg-primary text-primary-foreground'
                    : undefined
                }
              >
                <Flag aria-hidden />
                {t('final_round')}
              </Pill>
            )}
          </>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            aria-pressed={sounds.enabled}
            aria-label={t('sound_effects')}
            onClick={() => sounds.setEnabled(!sounds.enabled)}
          >
            {sounds.enabled ? (
              <Volume2 className="size-4" />
            ) : (
              <VolumeX className="size-4" />
            )}
          </Button>
          {canManage && full && (
            <>
              <Button asChild size="icon" variant="ghost">
                <a
                  href={quizArenaExportUrl(meetingId, 'csv')}
                  aria-label={t('export_csv')}
                  download
                >
                  <Download className="size-4" />
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href={quizArenaExportUrl(meetingId, 'json')} download>
                  {t('export_json')}
                </a>
              </Button>
            </>
          )}
          <Button
            aria-label={t('close_panel')}
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </span>
      </header>
      <div aria-busy={busy} className="min-h-0 space-y-3 overflow-y-auto p-3">
        {query.isPending && <p role="status">{t('loading')}</p>}
        {query.isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 text-sm"
          >
            {t('load_error')}
            <Button
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              size="sm"
              variant="outline"
            >
              {t('retry')}
            </Button>
          </div>
        )}
        {mutation.isError && (
          <p role="alert" className="text-destructive text-sm">
            {t(errorKey(mutation.error))}
          </p>
        )}
        {meta?.pickedBy === 'mira' && meta.phase === 'question' && (
          <MiraStatus>{t('mira_picked')}</MiraStatus>
        )}
        {showBuilder && (
          <QuizArenaBuilder
            busy={busy}
            locale={locale}
            miraUnavailable={miraUnavailable}
            courses={courses}
            onAction={act}
            onCancel={full ? () => setBuilderOpen(false) : undefined}
          />
        )}
        {view?.kind === 'empty' && !canManage && (
          <p className="text-muted-foreground text-sm">
            {t('empty_participant')}
          </p>
        )}
        {full && meta && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate font-extrabold text-base">
                {meta.title}
              </h3>
              {meta.source === 'mira' && (
                <MiraAttribution
                  label={t('generated_by_mira')}
                  className="ml-auto"
                />
              )}
              {meta.source === 'upskii' && (
                <Pill className="ml-auto">{t('imported_from_upskii')}</Pill>
              )}
              {meta.source === 'starter' && (
                <Pill className="ml-auto">{t('starter_board')}</Pill>
              )}
            </div>
            {meta.phase === 'ended' && (
              <p className="font-extrabold text-lg">{t('game_over')}</p>
            )}
            {active &&
              (meta.phase !== 'board' || active.status === 'revealed') && (
                <QuizArenaQuestion
                  view={full}
                  selfId={accountId}
                  tile={active}
                  busy={busy}
                  onAction={act}
                />
              )}
            {!meta.phase.startsWith('final') && (
              <QuizArenaBoard
                view={full}
                busy={busy}
                onPick={(tileId) => act({ action: 'pickTile', tileId })}
              />
            )}
            <QuizArenaLeaderboard view={full} selfId={accountId} />
            {canManage && (
              <QuizArenaHostControls
                view={full}
                busy={busy}
                onAction={act}
                onNewBoard={() => setBuilderOpen(true)}
              />
            )}
          </>
        )}
      </div>
    </ResizableCallPanel>
  );
}
