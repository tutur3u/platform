'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import {
  ActivityEmpty,
  type Activity,
  activityCardClass,
  ChoiceButton,
} from '../activity-kit';
import { useRoomDraft } from '../room-draft';

type Item = Activity['snapshot']['assessment']['items'][number];
type Mine = Activity['mine']['assessment'][string] | undefined;

/** A written answer the participant can send and, while open, replace. */
function WrittenAnswer({
  item,
  mine,
  open,
  send,
}: {
  item: Item;
  mine: Mine;
  open: boolean;
  send: Activity['send'];
}) {
  const t = useTranslations('meet.call.live_activities.assessment');
  // Their own answer can arrive after the questions; typed text always wins.
  const [draft, setDraft] = useRoomDraft(mine?.answer ?? '');
  const text = draft.trim();
  if (!open)
    return (
      <p className="wrap-break-word whitespace-pre-wrap rounded-xl bg-muted/40 px-3 py-2 text-sm">
        {mine?.answer ?? t('not_answered')}
      </p>
    );
  const field = {
    value: draft,
    maxLength: 2000,
    'aria-label': t('your_answer'),
    placeholder: t('your_answer'),
  };
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text)
          send({ kind: 'assessment.submit', itemId: item.id, answer: text });
      }}
    >
      {item.kind === 'long' ? (
        <Textarea
          {...field}
          rows={4}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <Input {...field} onChange={(event) => setDraft(event.target.value)} />
      )}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          className="h-8 rounded-full"
          disabled={!text || text === mine?.answer}
        >
          {t(mine?.answer ? 'update' : 'submit')}
        </Button>
        {mine?.answer && text === mine.answer && (
          <span role="status" className="text-muted-foreground text-xs">
            {t('submitted')}
          </span>
        )}
      </div>
    </form>
  );
}

/** What a participant sees: answer while open, then their own result on release. */
export function AssessmentParticipant({ activity }: { activity: Activity }) {
  const t = useTranslations('meet.call.live_activities.assessment');
  const { assessment } = activity.snapshot;
  if (assessment.status === 'draft' || !assessment.items.length)
    return <ActivityEmpty>{t('empty_participant')}</ActivityEmpty>;
  const open = assessment.status === 'open';
  return (
    <div className="space-y-3">
      {!open && (
        <p role="status" className="text-muted-foreground text-sm">
          {t(assessment.released ? 'released_note' : 'closed_note')}
        </p>
      )}
      <ol className="space-y-3">
        {assessment.items.map((item, index) => {
          const mine = activity.mine.assessment[item.id];
          return (
            <li key={item.id} className={activityCardClass}>
              <p className="wrap-break-word font-semibold text-sm">
                {index + 1}. {item.prompt}
              </p>
              {item.kind === 'choice' ? (
                <div
                  role="radiogroup"
                  aria-label={item.prompt}
                  className="space-y-1.5"
                >
                  {(item.options ?? []).map((option, position) => (
                    <ChoiceButton
                      // Options are identified by position: it is the answer key.
                      key={`${item.id}:${position}`}
                      selected={mine?.choice === position}
                      correct={item.correct === position}
                      onSelect={
                        open
                          ? () =>
                              activity.send({
                                kind: 'assessment.submit',
                                itemId: item.id,
                                choice: position,
                              })
                          : undefined
                      }
                    >
                      {option}
                    </ChoiceButton>
                  ))}
                  {open && mine?.choice !== undefined && (
                    <p role="status" className="text-muted-foreground text-xs">
                      {t('submitted')}
                    </p>
                  )}
                </div>
              ) : (
                <WrittenAnswer
                  item={item}
                  mine={mine}
                  open={open}
                  send={activity.send}
                />
              )}
              {assessment.released && mine?.score !== undefined && (
                <div className="space-y-1 border-t pt-3">
                  <Badge variant="secondary">
                    {t('your_score', { score: mine.score })}
                  </Badge>
                  {mine.feedback && (
                    <p className="wrap-break-word text-muted-foreground text-sm">
                      {mine.feedback}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
