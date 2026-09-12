'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkspaceMeeting } from '@tuturuuu/internal-api/meetings';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { canCreateOnlineMeeting } from '@tuturuuu/utils/meet-creation-policy';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function MiraMeetingCreate({ wsId }: { wsId: string }) {
  const t = useTranslations('dashboard.mira_workspace');
  const id = useId();
  const [name, setName] = useState('');
  const [time, setTime] = useState('');
  const [created, setCreated] = useState(false);
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['mira-meeting-account'],
    queryFn: () => getCurrentUserProfile(),
  });
  const create = useMutation({
    mutationFn: () =>
      createWorkspaceMeeting(wsId, {
        name: name.trim(),
        time: new Date(time).toISOString(),
      }),
    onSuccess: () => {
      setName('');
      setTime('');
      setCreated(true);
      void queryClient.invalidateQueries({
        queryKey: ['mira-artifact', wsId, 'meetings'],
      });
    },
  });
  if (profile.isPending) return null;
  if (!canCreateOnlineMeeting(profile.data?.email))
    return (
      <p className="text-muted-foreground text-xs">{t('meeting_restricted')}</p>
    );
  return (
    <form
      className="space-y-3 rounded-lg bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setCreated(false);
        create.mutate();
      }}
    >
      <Label htmlFor={`${id}-name`}>{t('meeting_name')}</Label>
      <Input
        id={`${id}-name`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={255}
        disabled={create.isPending}
      />
      <Label htmlFor={`${id}-time`}>{t('meeting_time')}</Label>
      <Input
        id={`${id}-time`}
        type="datetime-local"
        value={time}
        onChange={(event) => setTime(event.target.value)}
        required
        disabled={create.isPending}
      />
      <Button
        type="submit"
        size="sm"
        disabled={create.isPending || !name.trim() || !time}
      >
        {create.isPending ? t('creating') : t('create_meeting')}
      </Button>
      {create.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t('create_failed')}
        </p>
      )}
      {created && (
        <p role="status" className="text-muted-foreground text-sm">
          {t('meeting_created')}
        </p>
      )}
    </form>
  );
}
