'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { CheckCircle, Circle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';


export interface AttemptDetailDTO {
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
  maxPossibleScore: number;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number;
  explanationMode: 0 | 1 | 2;
  questions: Array<{
    quizId: string;
    question: string;
    scoreWeight: number;
    /** Now optional */
    selectedOptionId?: string | null;
    isCorrect: boolean;
    scoreAwarded: number;
    options: Array<{
      id: string;
      value: string;
      isCorrect: boolean;
      explanation: string | null;
    }>;
  }>;
}

export interface ShowAttemptDetailProps {
  detail: AttemptDetailDTO;
}

export default function ShowAttemptDetailSection({
  detail,
}: ShowAttemptDetailProps) {
  const t = useTranslations('ws-quizzes');
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : '—';
  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="space-y-8">
      {/* Metadata */}
      <div className="space-y-1 text-sm text-secondary-foreground">
        <div>
          {t('results.started_at') || 'Started at'}:{' '}
          {fmtDate(detail.startedAt)}
        </div>
        {detail.completedAt && (
          <div>
            {t('results.completed_at') || 'Completed at'}:{' '}
            {fmtDate(detail.completedAt)}
          </div>
        )}
        <div>
          {t('results.duration') || 'Duration'}:{' '}
          {fmtDuration(detail.durationSeconds)}
        </div>
      </div>

      {/* Questions */}
      {detail.questions.map((q, idx) => {
        const selId = q.selectedOptionId ?? null;
        return (
          <Card
            key={q.quizId}
            className={
              !q.isCorrect
                ? 'border-dynamic-light-red/40 bg-dynamic-light-pink/15'
                : ''
            }
          >
            <CardHeader>
              <CardTitle>
                {idx + 1}. {q.question}{' '}
                <span className="text-sm text-muted-foreground">
                  ({t('results.points') || 'Points'}: {q.scoreWeight})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-4">
              {q.options.map((opt) => {
                const chosen = selId === opt.id;
                return (
                  <div
                    key={opt.id}
                    className="flex items-center space-x-2 rounded-md border border-dynamic-purple/40 p-2 transition-colors hover:bg-secondary/10 md:space-x-4 md:p-4"
                    aria-label={`${opt.value} ${
                      opt.isCorrect
                        ? t('results.correct_option') || '(Correct)'
                        : chosen
                          ? t('results.your_answer') || '(Your answer)'
                          : ''
                    }`}
                  >
                    {opt.isCorrect ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : chosen ? (
                      <XCircle className="h-5 w-5 text-dynamic-light-red" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <div className="flex flex-col">
                      <span className={chosen ? 'font-semibold' : undefined}>
                        {opt.value}{' '}
                        {opt.isCorrect && (
                          <small className="text-green-600">
                            {t('results.correct') || '(Correct)'}
                          </small>
                        )}
                        {chosen && !opt.isCorrect && (
                          <small className="text-dynamic-light-red">
                            {t('results.your_answer') || '(Your answer)'}
                          </small>
                        )}
                      </span>
                      {opt.explanation && (
                        <p className="mt-1 text-sm text-primary">
                          {opt.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className={`mt-3 text-sm text-center md:text-right ${q.isCorrect ? "text-green-600" : "text-dynamic-light-red"}`}>
                {t('results.score_awarded') || 'Score Awarded'}:{' '}
                <strong>
                  {q.scoreAwarded} / {q.scoreWeight}
                </strong>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
