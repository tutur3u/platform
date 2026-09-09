'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  Check,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from '@tuturuuu/icons';
import {
  readMeetPrivateMemory,
  updateMeetPrivateMemory,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function MeetMemorySettings({
  userId,
  onPrivacyChange,
}: {
  userId: string;
  onPrivacyChange?: () => void;
}) {
  const t = useTranslations('meet.live');
  const id = useId();
  const client = useQueryClient();
  const key = ['meet-private-memory', userId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => readMeetPrivateMemory(),
    retry: false,
    enabled: !!userId,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateMeetPrivateMemory>[0]) =>
      updateMeetPrivateMemory(payload),
    onSuccess: async (_, input) => {
      if (
        input.action === 'settings' ||
        input.action === 'delete' ||
        input.action === 'edit'
      )
        onPrivacyChange?.();
      setEditing(null);
      setDraft('');
      setDeleting(null);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-enabled`} className="flex items-center gap-2">
            <Brain className="size-4" />
            {t('memory_title')}
          </Label>
          <p className="max-w-prose text-muted-foreground text-xs">
            {t('memory_hint')}
          </p>
        </div>
        <Switch
          id={`${id}-enabled`}
          checked={query.data?.enabled === true}
          disabled={!query.data || mutation.isPending}
          onCheckedChange={(enabled) =>
            mutation.mutate({ action: 'settings', enabled })
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="gap-1">
          <LockKeyhole className="size-3" />
          {t('only_you')}
        </Badge>
        {query.data && (
          <span className="text-muted-foreground tabular-nums">
            {t('memory_count', { count: query.data.memories.length })}
          </span>
        )}
      </div>
      {query.isLoading && (
        <p role="status" className="text-muted-foreground text-sm">
          {t('loading')}
        </p>
      )}
      {(query.error || mutation.error) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 p-3 text-sm"
        >
          <span>{t('memory_error')}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('retry')}
            onClick={() => {
              mutation.reset();
              void query.refetch();
            }}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      )}
      {query.data?.memories.length === 0 && (
        <p className="rounded-lg bg-muted/40 p-4 text-muted-foreground text-sm">
          {t('memory_empty')}
        </p>
      )}
      <ul className="max-h-72 divide-y overflow-y-auto">
        {query.data?.memories.map((memory) => (
          <li key={memory.id} className="space-y-2 py-3 first:pt-0">
            {editing === memory.id ? (
              <div className="space-y-2">
                <Textarea
                  aria-label={t('memory_content')}
                  maxLength={1000}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={mutation.isPending || !draft.trim()}
                    onClick={() =>
                      mutation.mutate({
                        action: 'edit',
                        id: memory.id,
                        content: draft,
                      })
                    }
                  >
                    <Check className="size-3.5" />
                    {t('save')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {memory.content}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={t('edit_memory')}
                  disabled={mutation.isPending}
                  onClick={() => {
                    setEditing(memory.id);
                    setDraft(memory.content);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={t('delete_memory')}
                  disabled={mutation.isPending}
                  onClick={() => setDeleting(memory.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )}
            {deleting === memory.id && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                <span className="min-w-0 flex-1">
                  {t('delete_memory_confirm')}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('cancel')}
                  onClick={() => setDeleting(null)}
                >
                  <X className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ action: 'delete', id: memory.id })
                  }
                >
                  {t('delete_memory')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {query.data?.enabled && !editing && (
        <div className="space-y-2 border-t pt-3">
          <Textarea
            aria-label={t('memory_content')}
            placeholder={t('memory_placeholder')}
            maxLength={1000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={
              mutation.isPending ||
              !draft.trim() ||
              query.data.memories.length >= 100
            }
            onClick={() =>
              mutation.mutate({
                action: 'save',
                content: draft,
                category: 'preference',
              })
            }
          >
            <Plus className="size-3.5" />
            {t('add_memory')}
          </Button>
        </div>
      )}
    </section>
  );
}
