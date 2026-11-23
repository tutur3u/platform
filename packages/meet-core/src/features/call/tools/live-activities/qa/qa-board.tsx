'use client';

import { RotateCcw, ShieldCheck, User } from '@tuturuuu/icons';
import { LIVE_QA_LIMITS } from '@tuturuuu/realtime/meet';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useActivityPane } from '../../../stage-layout/activity-pane-context';
import { useEffect, useId, useRef, useState } from 'react';
import { ToolAction } from '../../tool-ui';
import { QaComposer } from './qa-composer';
import { QaEmpty, qaEmptyKind } from './qa-empty';
import type { QaBoardContext } from './qa-parts';
import { QaQuestionCard } from './qa-question-card';
import {
  LIVE_QA_SORTS,
  type LiveQaSort,
  liveQaCounts,
  sortLiveQa,
} from './qa-sort';
import type { LiveQaView } from './qa-store';

const ERRORS: Record<string, string> = {
  qa_rate_limited: 'rate_limited',
  qa_full: 'full',
  qa_answers_full: 'answers_full',
  qa_invalid_length: 'invalid_length',
  qa_not_found: 'not_found',
  qa_anonymous_disabled: 'anonymous_disabled',
  attachment_unavailable: 'attachment_unavailable',
  permission_denied: 'permission',
  awaiting_admission: 'permission',
  too_large: 'too_large',
  qa_timeout: 'generic',
  upload_failed: 'upload_failed',
};

function SettingSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * The Q&A for one viewer: sort tabs, the host's moderation tools, the
 * questions and a composer that stays at the bottom of the scroll area.
 */
export function QaBoard({
  view,
  board,
  layout = 'page',
}: {
  view: LiveQaView;
  board: Omit<QaBoardContext, 'onUploadError' | 'canAnswer' | 'isHost'>;
  /**
   * `pane` fills a stage pane whose body does not scroll: the controls stay
   * on top, the questions scroll, and the composer stays at the bottom.
   * `page` flows in a scrolling page, with the composer stuck to its end.
   */
  layout?: 'page' | 'pane';
}) {
  const t = useTranslations('meet.call.live_activities.qa');
  const short = !!useActivityPane()?.short;
  const pane = layout === 'pane';
  const scroller = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const sticky = pane && !short;
  // A focused card scrolls into view below the sticky controls, not under them.
  useEffect(() => {
    const list = scroller.current;
    const controls = header.current;
    if (!list) return;
    if (!sticky || !controls || typeof ResizeObserver === 'undefined') {
      list.style.removeProperty('--qa-controls-height');
      return;
    }
    const measure = () =>
      list.style.setProperty(
        '--qa-controls-height',
        `${controls.getBoundingClientRect().height}px`
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [sticky]);
  const [sort, setSort] = useState<LiveQaSort>('top');
  const [moderating, setModerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const anonymousId = useId();
  const { snapshot, isHost } = view;
  const settings = snapshot.settings;
  const context: QaBoardContext = {
    ...board,
    self: view.self,
    isHost,
    canAnswer: isHost || settings?.answers !== 'hosts',
    onUploadError: setLocalError,
  };
  const reviewing = isHost && moderating;
  const questions = sortLiveQa(snapshot.questions, sort, {
    includeHidden: reviewing,
  });
  const counts = liveQaCounts(snapshot.questions);
  const hiddenCount = counts.hidden;
  const error = localError ?? view.error;
  const allowAnonymous = !!settings?.anonymous;
  // The controls always sit at the top of the list's own container, so crossing
  // the short-pane height changes a class and never remounts them: they stay in
  // view in a tall pane, and scroll away with the questions in a short one.
  const controls = (
    <div
      ref={header}
      className={cn(
        'space-y-3',
        sticky && 'sticky top-0 z-10 mb-0 bg-card pb-3'
      )}
    >
      {/* Narrow: the sort track spans the row and Moderate sits below it.
          Wide: both share one row. The track grows with its pills, so a
          44px touch target never overflows it. */}
      <div className="flex flex-col items-stretch gap-2 @min-[480px]:flex-row @min-[480px]:items-center">
        <Tabs
          value={sort}
          onValueChange={(value) => setSort(value as LiveQaSort)}
          className="min-w-0 @min-[480px]:flex-1"
        >
          <TabsList
            aria-label={t('sort_label')}
            data-testid="qa-sort-tabs"
            className="grid h-auto w-full grid-cols-3 @min-[480px]:inline-grid @min-[480px]:w-auto"
          >
            {LIVE_QA_SORTS.map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-8 px-3 pointer-coarse:min-h-11"
              >
                {t(`sort.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {isHost ? (
          <ToolAction
            icon={ShieldCheck}
            label={
              hiddenCount
                ? t('moderate_count', { count: hiddenCount })
                : t('moderate')
            }
            aria-pressed={moderating}
            variant={moderating ? 'secondary' : 'outline'}
            className="self-start pointer-coarse:h-11"
            onClick={() => setModerating((value) => !value)}
          />
        ) : null}
      </div>
      {reviewing ? (
        <section className="space-y-1 rounded-2xl border bg-muted/30 px-3 py-2">
          <SettingSwitch
            label={t('allow_anonymous')}
            checked={allowAnonymous}
            onChange={(value) =>
              board.client.send({ type: 'qa.settings', anonymous: value })
            }
          />
          <SettingSwitch
            label={t('hosts_answer')}
            checked={settings?.answers === 'hosts'}
            onChange={(value) =>
              board.client.send({
                type: 'qa.settings',
                answers: value ? 'hosts' : 'everyone',
              })
            }
          />
          <ToolAction
            icon={RotateCcw}
            label={t('reset_moderation')}
            variant="ghost"
            className="pointer-coarse:h-11"
            onClick={() => board.client.send({ type: 'qa.clear' })}
          />
        </section>
      ) : null}
      {error ? (
        <p role="status" className="text-dynamic-orange text-sm">
          {t(`errors.${ERRORS[error] ?? 'generic'}`)}
        </p>
      ) : null}
    </div>
  );
  return (
    <>
      <div
        ref={scroller}
        className={cn(
          'space-y-3',
          pane &&
            '-mx-4 min-h-0 flex-1 scroll-pt-[calc(var(--qa-controls-height)+4px)] overflow-y-auto px-4'
        )}
      >
        {controls}
        {questions.length ? (
          <ul className="-my-1 space-y-3 py-1">
            {questions.map((question) => (
              <li key={question.id}>
                <QaQuestionCard question={question} board={context} />
              </li>
            ))}
          </ul>
        ) : (
          <QaEmpty
            kind={qaEmptyKind(sort, counts, { isHost, reviewing })}
            hiddenCount={counts.hidden}
          />
        )}
      </div>
      <div
        className={cn(
          'z-10 border-t py-3',
          pane
            ? '-mx-4 -mb-4 shrink-0 bg-card px-4'
            : 'sticky bottom-0 bg-background'
        )}
      >
        <QaComposer
          compact={pane && short}
          compactPlaceholder={t('composer_placeholder_short')}
          meetingId={board.meetingId}
          label={t('composer_label')}
          placeholder={t('composer_placeholder')}
          submitLabel={t('ask')}
          maxLength={LIVE_QA_LIMITS.questionChars}
          canAttach={!view.self?.guest}
          leading={
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
            >
              <User className="size-4" />
            </span>
          }
          extra={
            allowAnonymous ? (
              <span className="flex items-center gap-2 ps-1">
                <Switch
                  id={anonymousId}
                  checked={anonymous}
                  onCheckedChange={setAnonymous}
                />
                <label htmlFor={anonymousId} className="text-xs">
                  {t('ask_anonymously')}
                </label>
              </span>
            ) : null
          }
          onUploadError={setLocalError}
          onSubmit={(text, attachmentIds) => {
            setLocalError(null);
            board.client.dismissError();
            board.client.send({
              type: 'qa.ask',
              text,
              attachmentIds,
              ...(allowAnonymous && anonymous ? { anonymous: true } : {}),
            });
          }}
        />
      </div>
    </>
  );
}
