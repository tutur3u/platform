'use client';

import { Trash2 } from '@tuturuuu/icons';
import { discardMeetChatFile } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { ToolIconAction } from '../../tool-ui';
import { QaAttachments } from './qa-attachments';
import {
  QaAvatar,
  type QaBoardContext,
  QaChip,
  QaTime,
  useQaAuthor,
} from './qa-parts';
import type { LiveQaAnswer, LiveQaQuestion } from './qa-store';

/**
 * Deletes an answer, then removes its files from storage. The room releases
 * them to their uploader and to hosts once the answer is gone, so this runs
 * only after the room confirms the delete. A failed removal leaves files
 * that no one can read any more.
 */
async function deleteAnswer(
  board: QaBoardContext,
  questionId: string,
  answer: LiveQaAnswer
) {
  const refused = await board.client.request({
    type: 'qa.answer.delete',
    questionId,
    answerId: answer.id,
  });
  if (refused) return;
  await Promise.all(
    answer.attachmentIds.map((id) =>
      discardMeetChatFile(board.meetingId, id).catch(() => undefined)
    )
  );
}

/** A question's answers, oldest first, as a thread under it. */
export function QaAnswers({
  question,
  board,
}: {
  question: LiveQaQuestion;
  board: QaBoardContext;
}) {
  const t = useTranslations('meet.call.live_activities.qa');
  const author = useQaAuthor(board.self);
  const answers = question.answers ?? [];
  if (!answers.length) return null;
  return (
    <ol
      aria-label={t('answers_count', { count: answers.length })}
      className="space-y-3 border-s-2 ps-3"
    >
      {answers.map((answer) => {
        const name = author(answer);
        const mine =
          !!answer.participantId &&
          answer.participantId === board.self?.participantId;
        return (
          <li key={answer.id} className="flex gap-2.5">
            <QaAvatar name={answer.authorName ?? name} className="size-7" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                <span className="font-medium text-foreground">{name}</span>
                {answer.byHost ? <QaChip>{t('host_chip')}</QaChip> : null}
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <QaTime iso={answer.createdAt} />
              </p>
              {answer.text ? (
                <p className="wrap-break-word whitespace-pre-wrap text-sm">
                  {answer.text}
                </p>
              ) : null}
              <QaAttachments
                meetingId={board.meetingId}
                ids={answer.attachmentIds}
                guest={board.self?.guest}
              />
            </div>
            {mine || board.isHost ? (
              <ToolIconAction
                icon={Trash2}
                label={t('delete_answer')}
                onClick={() => void deleteAnswer(board, question.id, answer)}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
