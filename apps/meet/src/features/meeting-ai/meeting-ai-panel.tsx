'use client';

import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { useMeetingAi } from './use-meeting-ai';

export function MeetingAiPanel({
  ai,
  inCall = false,
}: {
  ai: ReturnType<typeof useMeetingAi>;
  inCall?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const run = (work: () => Promise<unknown>) =>
    void work().catch(() => toast.error(t('failed')));
  const data = ai.data;
  const active = data?.sessions.find((session) => !session.ended_at);
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">{t('title')}</h2>
      {ai.isLoading ? <p role="status">{t('loading')}</p> : null}
      {ai.error ? <p role="alert">{t('unavailable')}</p> : null}
      {data ? (
        <>
          <p className="text-muted-foreground text-xs">{t('notice')}</p>
          {!data.configured ? <p>{t('not_configured')}</p> : null}
          {active ? (
            <p role="status" className="font-medium text-sm">
              {t(ai.capturing ? 'capturing' : 'active')}
            </p>
          ) : null}
          {ai.captureError ||
          data.chunks.some((chunk) => chunk.status === 'failed') ? (
            <p role="alert" className="text-destructive text-sm">
              {t('partial')}
            </p>
          ) : null}
          {ai.busy ? <p role="status">{t('processing')}</p> : null}
          {data.canManage && data.configured ? (
            <div className="flex flex-wrap gap-2">
              {inCall && !active ? (
                <Button disabled={ai.busy} onClick={() => run(ai.start)}>
                  {t('start')}
                </Button>
              ) : null}
              {active ? (
                <Button
                  disabled={ai.busy}
                  variant="secondary"
                  onClick={() => run(() => ai.finish(active.id))}
                >
                  {t('finish')}
                </Button>
              ) : null}
              {data.sessions
                .filter(
                  (session) =>
                    session.ended_at && session.notes_status !== 'completed'
                )
                .map((session) => (
                  <Button
                    key={session.id}
                    disabled={
                      ai.busy ||
                      (session.notes_status === 'processing' &&
                        (!session.notes_started_at ||
                          Date.now() - Date.parse(session.notes_started_at) <
                            120_000))
                    }
                    variant="secondary"
                    onClick={() => run(() => ai.finish(session.id))}
                  >
                    {t('retry_notes')}
                  </Button>
                ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-xs">
            <span>{t('cost')}</span>
            <strong>${data.estimatedCostUsd.toFixed(6)} USD</strong>
            <span>{t('transcript')}</span>
            <span>${data.transcriptionCostUsd.toFixed(6)}</span>
            <span>{t('notes')}</span>
            <span>${data.notesCostUsd.toFixed(6)}</span>
            <span>{t('model')}</span>
            <span className="break-all">{data.model}</span>
            <span>{t('input_tokens')}</span>
            <span>{data.inputTokens.toLocaleString()}</span>
            <span>{t('output_tokens')}</span>
            <span>{data.outputTokens.toLocaleString()}</span>
            <span>{t('audio_minutes')}</span>
            <span>
              {(
                data.chunks.reduce(
                  (total, chunk) => total + chunk.duration_seconds,
                  0
                ) / 60
              ).toFixed(1)}
            </span>
          </div>
          {data.unpricedRequests ? (
            <p className="text-xs">
              {t('unpriced', { count: data.unpricedRequests })}
            </p>
          ) : null}
          <section
            className="max-h-80 space-y-2 overflow-y-auto"
            aria-label={t('transcript')}
          >
            <h3 className="font-medium text-sm">{t('transcript')}</h3>
            {data.chunks.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('empty')}</p>
            ) : null}
            {data.chunks.map((chunk) => (
              <p key={chunk.id} className="text-sm">
                <span className="mr-2 text-muted-foreground text-xs">
                  {Math.floor(chunk.start_seconds / 60)}:
                  {String(Math.floor(chunk.start_seconds % 60)).padStart(
                    2,
                    '0'
                  )}
                </span>
                {chunk.transcript ||
                  t(
                    chunk.status === 'processing'
                      ? 'processing'
                      : chunk.status === 'failed'
                        ? 'missing'
                        : 'silence'
                  )}
              </p>
            ))}
          </section>
          {data.sessions.map((session) =>
            session.notes ? (
              <div key={session.id} className="space-y-2 border-t pt-3 text-sm">
                <h3 className="font-medium">{t('notes')}</h3>
                {session.notes.incomplete ? (
                  <p className="text-destructive">{t('partial')}</p>
                ) : null}
                <p className="whitespace-pre-wrap">{session.notes.summary}</p>
                <h4 className="font-medium">{t('decisions')}</h4>
                <ul className="list-inside list-disc">
                  {session.notes.decisions.map((value, index) => (
                    <li key={`${index}-${value}`}>{value}</li>
                  ))}
                </ul>
                <h4 className="font-medium">{t('actions')}</h4>
                <ul className="list-inside list-disc">
                  {session.notes.actionItems.map((item, index) => (
                    <li key={`${index}-${item.task}`}>
                      {item.task}
                      {item.owner ? ` — ${item.owner}` : ''}
                      {item.dueDate ? ` (${item.dueDate})` : ''}
                    </li>
                  ))}
                </ul>
                <h4 className="font-medium">{t('questions')}</h4>
                <ul className="list-inside list-disc">
                  {session.notes.openQuestions.map((value, index) => (
                    <li key={`${index}-${value}`}>{value}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </>
      ) : null}
    </section>
  );
}
