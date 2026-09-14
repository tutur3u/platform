'use client';
import type { LettinWorld } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useLettinMutation } from './use-lettin';
export function Collaborators({
  wsId,
  data,
}: {
  wsId: string;
  data: LettinWorld;
}) {
  const t = useTranslations('lettin');
  const mutation = useLettinMutation(wsId);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'editor' | 'publisher'>('editor');
  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer">{t('collaborators')}</summary>
      <p className="my-3 text-muted-foreground text-sm">
        {t('collaboratorsHint')}
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            action: 'setCollaborator',
            worldId: data.world.id,
            userId,
            role,
          });
        }}
      >
        <select
          required
          aria-label={t('member')}
          className="max-w-full rounded border border-input bg-background p-2"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">{t('selectMember')}</option>
          {data.eligibleMembers.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name || m.user_id}
            </option>
          ))}
        </select>
        <select
          aria-label={t('role')}
          className="rounded border border-input bg-background p-2"
          value={role}
          onChange={(e) => setRole(e.target.value as 'editor' | 'publisher')}
        >
          <option value="editor">{t('editor')}</option>
          <option value="publisher">{t('publisher')}</option>
        </select>
        <Button disabled={!userId || mutation.isPending}>
          {t('addCollaborator')}
        </Button>
      </form>
      <ul className="mt-4 space-y-2">
        {data.collaborators.map((c) => (
          <li
            key={c.user_id}
            className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-2"
          >
            <span>
              {c.name || c.user_id} · {t(c.role)}
            </span>
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  action: 'removeCollaborator',
                  worldId: data.world.id,
                  userId: c.user_id,
                })
              }
            >
              {t('remove')}
            </Button>
          </li>
        ))}
      </ul>
      {mutation.errorMessage && <p role="alert">{mutation.errorMessage}</p>}
    </details>
  );
}
