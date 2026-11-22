'use client';

import { Eye, EyeOff, Lock, PencilLine, Play } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ToolAction } from '../../tool-ui';
import { type Activity, activityCardClass } from '../activity-kit';
import { NewAttemptAction } from './new-attempt-action';

type Response = NonNullable<
  Activity['host']
>['assessment']['responses'][number];

/**
 * One written answer with the host's score and private feedback. Grading waits
 * until answers are closed, and each grade names the answer revision it read,
 * so it can never land on a rewritten answer.
 */
function GradeRow({
  response,
  attemptId,
  name,
  canGrade,
  send,
}: {
  response: Response;
  attemptId: string | null;
  name: string;
  canGrade: boolean;
  send: Activity['send'];
}) {
  const t = useTranslations('meet.call.live_activities.assessment');
  const [score, setScore] = useState(
    response.score === undefined ? '' : String(response.score)
  );
  const [feedback, setFeedback] = useState(response.feedback ?? '');
  const value = Number(score);
  const valid = score.trim() !== '' && value >= 0 && value <= 100;
  const changed =
    value !== response.score || feedback.trim() !== (response.feedback ?? '');
  const answer = (
    <>
      <p className="font-semibold text-xs">{name}</p>
      <p className="wrap-break-word whitespace-pre-wrap text-sm">
        {response.answer}
      </p>
    </>
  );
  if (!canGrade)
    return <li className="space-y-2 rounded-xl bg-muted/40 p-3">{answer}</li>;
  return (
    <li className="space-y-2 rounded-xl bg-muted/40 p-3">
      {answer}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          send({
            kind: 'assessment.grade',
            attemptId,
            itemId: response.itemId,
            participantId: response.participantId,
            revision: response.revision,
            score: value,
            ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
          });
        }}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={score}
          aria-label={t('score_for', { name })}
          placeholder={t('score')}
          className="w-24"
          onChange={(event) => setScore(event.target.value)}
        />
        <Input
          value={feedback}
          maxLength={400}
          aria-label={t('feedback_for', { name })}
          placeholder={t('feedback')}
          className="min-w-32 flex-1"
          onChange={(event) => setFeedback(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8 rounded-full"
          disabled={!valid || !changed}
        >
          {t(response.score === undefined ? 'grade' : 'regrade')}
        </Button>
      </form>
    </li>
  );
}

/** The host's view while the assessment is open or closed. */
export function AssessmentHost({ activity }: { activity: Activity }) {
  const t = useTranslations('meet.call.live_activities.assessment');
  const [confirmEdit, setConfirmEdit] = useState(false);
  const { assessment } = activity.snapshot;
  const responses = activity.host?.assessment.responses ?? [];
  const answers = activity.host?.assessment.answers ?? {};
  const open = assessment.status === 'open';
  // Every command names the attempt and status on screen, so the room can
  // refuse one that another host's action has overtaken.
  const { attemptId, sealed, status: from } = assessment;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {sealed && !open ? (
          // A released attempt cannot reopen: the way on discards its answers.
          <NewAttemptAction
            onConfirm={() =>
              activity.send({ kind: 'assessment.restart', attemptId })
            }
          />
        ) : (
          <ToolAction
            icon={open ? Lock : Play}
            label={t(open ? 'close_answers' : 'reopen')}
            onClick={() =>
              activity.send({
                kind: 'assessment.status',
                status: open ? 'closed' : 'open',
                attemptId,
                from,
              })
            }
          />
        )}
        <ToolAction
          icon={assessment.released ? EyeOff : Eye}
          label={t(assessment.released ? 'hide_results' : 'release')}
          variant={assessment.released ? 'outline' : 'default'}
          // Results go out only once answers are final.
          disabled={open}
          onClick={() =>
            activity.send({
              kind: 'assessment.release',
              released: !assessment.released,
              attemptId,
            })
          }
        />
        <ToolAction
          icon={PencilLine}
          label={t(confirmEdit ? 'edit_confirm' : 'edit')}
          variant={confirmEdit ? 'destructive' : 'ghost'}
          onClick={() => {
            if (!confirmEdit) return setConfirmEdit(true);
            setConfirmEdit(false);
            activity.send({
              kind: 'assessment.status',
              status: 'draft',
              attemptId,
              from,
            });
          }}
        />
      </div>
      {(confirmEdit || open) && (
        <p role="status" className="text-muted-foreground text-xs">
          {t(confirmEdit ? 'edit_hint' : 'release_hint')}
        </p>
      )}
      <ol className="space-y-3">
        {assessment.items.map((item, index) => {
          const given = responses.filter(({ itemId }) => itemId === item.id);
          const key = answers[item.id];
          return (
            <li key={item.id} className={activityCardClass}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 wrap-break-word font-semibold text-sm">
                  {index + 1}. {item.prompt}
                </p>
                <Badge variant="secondary">
                  {t('responses', { count: assessment.counts[item.id] ?? 0 })}
                </Badge>
              </div>
              {item.kind === 'choice' ? (
                <ul className="space-y-1.5">
                  {(item.options ?? []).map((option, position) => {
                    const pickers = given.filter(
                      ({ choice }) => choice === position
                    );
                    return (
                      <li
                        // Options are identified by position: it is the answer key.
                        key={`${item.id}:${position}`}
                        className="rounded-xl bg-muted/40 px-3 py-2 text-sm"
                      >
                        <p className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 wrap-break-word">
                            {option}
                          </span>
                          {key === position && (
                            <Badge variant="outline">{t('correct')}</Badge>
                          )}
                          <span className="text-muted-foreground tabular-nums">
                            {pickers.length}
                          </span>
                        </p>
                        {pickers.length > 0 && (
                          <p className="pt-1 text-muted-foreground text-xs">
                            {pickers
                              .map(({ participantId }) =>
                                activity.nameOf(participantId)
                              )
                              .join(', ')}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : given.length ? (
                <ul className="space-y-2">
                  {given.map((response) => (
                    <GradeRow
                      // A replaced answer or a saved grade starts the form over.
                      key={`${response.participantId}:${response.revision}:${response.score}:${response.feedback}`}
                      response={response}
                      attemptId={attemptId}
                      name={activity.nameOf(response.participantId)}
                      canGrade={!open}
                      send={activity.send}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t('no_responses')}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
