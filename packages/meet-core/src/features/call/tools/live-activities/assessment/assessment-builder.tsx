'use client';

import { Play, Plus, Save, Trash2 } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { ToolAction, ToolIconAction } from '../../tool-ui';
import {
  ActivityEmpty,
  type Activity,
  activityCardClass,
  OptionsEditor,
} from '../activity-kit';
import { radioGroupKeyDown } from '../choice-group';
import { useRoomDraft } from '../room-draft';
import {
  ASSESSMENT_KINDS,
  assessmentItems,
  type DraftItem,
  MAX_ASSESSMENT_ITEMS,
  newDraftItem,
  sameAssessment,
  sameDraftItems,
} from './assessment-draft';

/** The host's draft: questions are saved to the room, then opened for answers. */
export function AssessmentBuilder({
  saved,
  attemptId,
  send,
}: {
  saved: DraftItem[];
  /** The saved draft this builder shows; opening names it. */
  attemptId: string | null;
  send: Activity['send'];
}) {
  const t = useTranslations('meet.call.live_activities.assessment');
  // The room issues new ids on save, sends the answer keys after the questions
  // and repeats both after a reconnect; none may replace a question in progress.
  const [drafts, setDrafts] = useRoomDraft(saved, sameDraftItems);
  const items = assessmentItems(drafts);
  const dirty = !sameAssessment(drafts, saved);
  const update = (key: string, patch: Partial<DraftItem>) =>
    setDrafts((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  return (
    <div className="space-y-3">
      {!drafts.length && <ActivityEmpty>{t('empty_host')}</ActivityEmpty>}
      <ol className="space-y-3">
        {drafts.map((item, index) => (
          <li key={item.key} className={activityCardClass}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground text-xs">
                {t('question_number', { number: index + 1 })}
              </span>
              <span className="flex-1" />
              <ToolIconAction
                icon={Trash2}
                label={t('remove_question', { number: index + 1 })}
                onClick={() =>
                  setDrafts((current) =>
                    current.filter((entry) => entry.key !== item.key)
                  )
                }
              />
            </div>
            <Input
              value={item.prompt}
              maxLength={240}
              aria-label={t('prompt')}
              placeholder={t('prompt_placeholder')}
              onChange={(event) =>
                update(item.key, { prompt: event.target.value })
              }
            />
            <div
              role="radiogroup"
              aria-label={t('kind')}
              className="inline-flex gap-0.5 rounded-full border bg-muted/50 p-0.5"
              onKeyDown={(event) => radioGroupKeyDown(event, true)}
            >
              {ASSESSMENT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={item.kind === kind}
                  tabIndex={item.kind === kind ? 0 : -1}
                  onClick={() => update(item.key, { kind })}
                  className={cn(
                    'h-8 pointer-coarse:h-11 rounded-full px-3 font-semibold text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                    item.kind === kind &&
                      'bg-background text-foreground shadow-xs'
                  )}
                >
                  {t(`kind_${kind}`)}
                </button>
              ))}
            </div>
            {item.kind === 'choice' && (
              <OptionsEditor
                name={`assessment-answer-${item.key}`}
                options={item.options}
                answer={item.answer}
                onChange={(options, answer) =>
                  update(item.key, { options, answer })
                }
              />
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <ToolAction
          icon={Plus}
          label={t('add_question')}
          disabled={drafts.length >= MAX_ASSESSMENT_ITEMS}
          onClick={() => setDrafts((current) => [...current, newDraftItem()])}
        />
        <ToolAction
          icon={Save}
          label={t('save')}
          disabled={!items || !dirty}
          onClick={() => items && send({ kind: 'assessment.set', items })}
        />
        <ToolAction
          icon={Play}
          label={t('open')}
          variant="default"
          disabled={dirty || !saved.length}
          onClick={() =>
            send({
              kind: 'assessment.status',
              status: 'open',
              attemptId,
              from: 'draft',
            })
          }
        />
      </div>
      {dirty && (
        <p className="text-muted-foreground text-xs">
          {t(items ? 'unsaved' : 'incomplete')}
        </p>
      )}
    </div>
  );
}
