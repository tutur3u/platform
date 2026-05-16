'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceCoursePost,
  listWorkspaceCoursePosts,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-3">
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
