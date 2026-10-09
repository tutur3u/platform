'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceTask,
  listWorkspaceBoardsWithLists,
} from '@tuturuuu/internal-api';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { MAX_TASK_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Link } from '@/i18n/routing';
import { TaskPlanPriority } from './task-plan-priority';
import { TaskPlanSource } from './task-plan-source';

export function TaskPlanComposer({
  wsId,
  routeWsId,
  sourceUrl,
}: {
  wsId: string;
  routeWsId: string;
  sourceUrl?: string;
}) {
  const t = useTranslations('task-plan');
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [boardId, setBoardId] = useState('');
  const [listId, setListId] = useState('');
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [attachSource, setAttachSource] = useState(false);
  const submitting = useRef(false);
  const [creationUnconfirmed, setCreationUnconfirmed] = useState(false);
  const query = useQuery({
    queryKey: ['task-plan-boards', wsId],
    queryFn: () => listWorkspaceBoardsWithLists(wsId),
  });
  const boards = query.data?.boards ?? [];
  const board = boards.find((item) => item.id === boardId);
  const lists = board?.task_lists.filter((list) => !list.deleted) ?? [];
  const list = lists.find((item) => item.id === listId);
  const mutation = useMutation({
    retry: false,
    mutationFn: () => {
      if (!name.trim() || !board || !list)
        throw new Error('Invalid task destination');
      return createWorkspaceTask(wsId, {
        name: name.trim(),
        listId: list.id,
        ...(priority ? { priority } : {}),
        ...(attachSource && sourceUrl
          ? {
              description: JSON.stringify({
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: sourceUrl,
                        marks: [
                          {
                            type: 'link',
                            attrs: {
                              href: sourceUrl,
                              target: '_blank',
                              rel: 'noopener noreferrer',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              }),
            }
          : {}),
      });
    },
    onError: () => {
      setCreationUnconfirmed(true);
    },
    onSuccess: () => {
      for (const family of ['tasks', 'tasks-full', 'task_lists']) {
        void client.invalidateQueries({ queryKey: [family, boardId] });
      }
    },
  });
  if (mutation.isSuccess)
    return (
      <section className="space-y-4 p-6">
        <p role="status">{t('created')}</p>
        <Link
          href={`/${routeWsId}/boards/${boardId}?task=${mutation.data.task.id}`}
          className="underline"
        >
          {t('openTask')}
        </Link>
      </section>
    );
  return (
    <section className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('hint')}</p>
      </header>
      {query.isPending && <p role="status">{t('loading')}</p>}
      {query.isError && (
        <div role="alert">
          <p>{t('loadFailed')}</p>
          <Button onClick={() => query.refetch()}>{t('retry')}</Button>
        </div>
      )}
      {!query.isPending && !query.isError && boards.length === 0 && (
        <p>
          {t('noBoards')}{' '}
          <Link className="underline" href={`/${routeWsId}/tasks`}>
            {t('openBoards')}
          </Link>
        </p>
      )}
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitting.current || !name.trim() || !list) return;
          submitting.current = true;
          mutation.mutate();
        }}
      >
        <fieldset
          disabled={mutation.isPending || creationUnconfirmed}
          className="space-y-5"
        >
          <label className="block space-y-2">
            {t('name')}
            <Input
              required
              maxLength={MAX_TASK_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block space-y-2">
            {t('board')}
            <select
              className="w-full rounded-md border border-input bg-background p-2"
              required
              value={boardId}
              onChange={(event) => {
                setBoardId(event.target.value);
                setListId('');
              }}
            >
              <option value="">{t('chooseBoard')}</option>
              {boards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || t('untitledBoard')}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            {t('list')}
            <select
              className="w-full rounded-md border border-input bg-background p-2"
              required
              value={listId}
              disabled={!board}
              onChange={(event) => setListId(event.target.value)}
            >
              <option value="">{t('chooseList')}</option>
              {lists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || t('untitledList')}
                </option>
              ))}
            </select>
          </label>
          <TaskPlanPriority value={priority} onChange={setPriority} />
          {sourceUrl && (
            <TaskPlanSource
              sourceUrl={sourceUrl}
              checked={attachSource}
              onChange={setAttachSource}
            />
          )}
          <p className="text-muted-foreground text-sm">
            {t('destinationConsent')}
          </p>
          <Button
            type="submit"
            disabled={
              query.isError || !name.trim() || !list || mutation.isPending
            }
          >
            {t(mutation.isPending ? 'creating' : 'create')}
          </Button>
        </fieldset>
        {mutation.isError && (
          <div role="alert" className="space-y-2">
            <p>{t('createFailed')}</p>
            <Link
              className="underline"
              href={`/${routeWsId}/boards/${boardId}`}
            >
              {t('openBoards')}
            </Link>
          </div>
        )}
      </form>
    </section>
  );
}
