'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from '@tuturuuu/icons';
import {
  createWorkspaceCoursePost,
  listWorkspaceCoursePosts,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LEARN_APP_URL } from '@/constants/common';

export function PostsPanel({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachOperations');
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const postsQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCoursePosts(wsId, courseId),
    queryKey: ['teach-posts', wsId, courseId],
  });
  const createPost = useMutation({
    mutationFn: () =>
      createWorkspaceCoursePost(wsId, courseId, {
        content: content.trim() || null,
        title: title.trim() || null,
      }),
    onSuccess: () => {
      setTitle('');
      setContent('');
      queryClient.invalidateQueries({
        queryKey: ['teach-posts', wsId, courseId],
      });
    },
  });
  const learnAssignmentsUrl = `${LEARN_APP_URL}/${wsId}/assignments`;

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-black">{t('learnerAssignmentPreview')}</p>
            <p className="text-muted-foreground text-sm">
              {t('learnerAssignmentPreviewLead')}
            </p>
          </div>
          <Button asChild variant="outline">
            <a href={learnAssignmentsUrl} rel="noreferrer" target="_blank">
              <ExternalLink className="h-4 w-4" />
              {t('openLearnAssignments')}
            </a>
          </Button>
        </div>
        {(postsQuery.data?.data ?? []).map((post) => (
          <article
            className="border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)]"
            key={post.id}
          >
            <p className="font-black text-lg">
              {post.title ?? t('untitledPost')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
              {post.content ?? t('emptyPost')}
            </p>
          </article>
        ))}
      </div>
      <div className="space-y-3 border-2 border-border bg-background p-4 shadow-[5px_5px_0_var(--border)]">
        <input
          className="h-11 w-full border-2 border-border bg-card px-3 font-bold outline-none focus:border-primary"
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('postTitle')}
          value={title}
        />
        <textarea
          className="min-h-40 w-full resize-y border-2 border-border bg-card p-3 outline-none focus:border-primary"
          onChange={(event) => setContent(event.target.value)}
          placeholder={t('postContent')}
          value={content}
        />
        <button
          className="inline-flex h-11 items-center border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] disabled:opacity-60"
          disabled={createPost.isPending || (!title.trim() && !content.trim())}
          onClick={() => createPost.mutate()}
          type="button"
        >
          {createPost.isPending ? t('saving') : t('createPost')}
        </button>
      </div>
    </section>
  );
}
