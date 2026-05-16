'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceCourseReport,
  listWorkspaceCourseMembers,
  listWorkspaceCourseReports,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ReportsPanel({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachOperations');
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [feedback, setFeedback] = useState('');
  const membersQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseMembers(wsId, courseId),
    queryKey: ['teach-course-members', wsId, courseId],
  });
  const reportsQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseReports(wsId, courseId),
    queryKey: ['teach-reports', wsId, courseId],
  });
  const activeUserId = userId || membersQuery.data?.data[0]?.id || '';
  const createReport = useMutation({
    mutationFn: () =>
      createWorkspaceCourseReport(wsId, courseId, {
        content,
        feedback,
        title,
        user_id: activeUserId,
      }),
    onSuccess: () => {
      setTitle('');
      setContent('');
      setFeedback('');
      queryClient.invalidateQueries({
        queryKey: ['teach-reports', wsId, courseId],
      });
    },
  });

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-3">
        {(reportsQuery.data?.data ?? []).map((report) => (
          <article
            className="border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)]"
            key={report.id}
          >
            <p className="font-black text-lg">{report.title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{report.content}</p>
            <p className="mt-3 whitespace-pre-wrap text-muted-foreground text-sm">
              {report.feedback}
            </p>
          </article>
        ))}
      </div>
      <div className="space-y-3 border-2 border-border bg-background p-4 shadow-[5px_5px_0_var(--border)]">
        <select
          className="h-11 w-full border-2 border-border bg-card px-3 font-bold outline-none focus:border-primary"
          onChange={(event) => setUserId(event.target.value)}
          value={activeUserId}
        >
          {(membersQuery.data?.data ?? []).map((member) => (
            <option key={member.id} value={member.id}>
              {member.full_name ?? member.display_name ?? member.email}
            </option>
          ))}
        </select>
        <input
          className="h-11 w-full border-2 border-border bg-card px-3 font-bold outline-none focus:border-primary"
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('reportTitle')}
          value={title}
        />
        <textarea
          className="min-h-32 w-full resize-y border-2 border-border bg-card p-3 outline-none focus:border-primary"
          onChange={(event) => setContent(event.target.value)}
          placeholder={t('reportContent')}
          value={content}
        />
        <textarea
          className="min-h-24 w-full resize-y border-2 border-border bg-card p-3 outline-none focus:border-primary"
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={t('reportFeedback')}
          value={feedback}
        />
        <button
          className="inline-flex h-11 items-center border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] disabled:opacity-60"
          disabled={
            createReport.isPending ||
            !activeUserId ||
            !title.trim() ||
            !content.trim()
          }
          onClick={() => createReport.mutate()}
          type="button"
        >
          {createReport.isPending ? t('saving') : t('createReport')}
        </button>
      </div>
    </section>
  );
}
