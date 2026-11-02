'use client';

import { useQuery } from '@tanstack/react-query';
import { getTutoringStudentView } from '@tuturuuu/internal-api/tutoring';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function TutoringStudentPanel({
  wsId,
  studentUserId,
  commentsEnabled,
  currentGroupIds,
}: {
  wsId: string;
  studentUserId: string;
  commentsEnabled: boolean;
  currentGroupIds: string[] | null;
}) {
  const t = useTranslations('ws-tutoring');
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const query = useQuery({
    queryKey: [
      'tutoring-student',
      wsId,
      studentUserId,
      month,
      commentsEnabled,
      currentGroupIds,
    ],
    queryFn: () =>
      getTutoringStudentView(wsId, {
        enabled: true,
        commentsEnabled,
        studentUserId,
        month,
        currentGroupIds,
      }),
  });
  return (
    <section className="space-y-4">
      <Input
        type="month"
        aria-label={t('student_month')}
        value={month}
        onChange={(event) => {
          if (event.target.value) setMonth(event.target.value);
        }}
      />
      {query.isPending ? (
        <output>{t('student_loading')}</output>
      ) : query.isError ? (
        <Button onClick={() => void query.refetch()}>
          {t('student_retry')}
        </Button>
      ) : (
        query.data && (
          <>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt>{t('student_no_shows')}</dt>
                <dd>{query.data.noShows}</dd>
              </div>
              {query.data.classAbsences !== null && (
                <div>
                  <dt>{t('student_class_absences')}</dt>
                  <dd>{query.data.classAbsences}</dd>
                </div>
              )}
            </dl>
            {query.data.sessions.length === 0 && <p>{t('student_empty')}</p>}
            <ol className="space-y-3">
              {query.data.sessions.map((session) => (
                <li key={session.id} className="rounded-lg border p-4">
                  <p>
                    {session.session_date} · {session.start_time.slice(0, 5)} ·{' '}
                    {t(`status_${session.attendance_status.toLowerCase()}`)}
                  </p>
                  <p className="whitespace-pre-wrap">{session.content}</p>
                  {commentsEnabled && session.tutor_comment && (
                    <div>
                      <h3 className="font-medium">{t('tutor_comment')}</h3>
                      <p className="whitespace-pre-wrap">
                        {session.tutor_comment}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )
      )}
    </section>
  );
}
