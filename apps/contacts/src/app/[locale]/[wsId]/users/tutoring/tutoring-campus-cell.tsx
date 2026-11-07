'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type TutoringSessionRecord,
  updateTutoringSession,
} from '@tuturuuu/internal-api';
import {
  getTutoringCampus,
  TUTORING_CAMPUS_LABEL_MAX_LENGTH,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function TutoringCampusCell({
  canManage,
  policy,
  session,
  wsId,
}: {
  canManage: boolean;
  policy: TutoringPolicy;
  session: TutoringSessionRecord;
  wsId: string;
}) {
  const t = useTranslations('ws-tutoring');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inherited = getTutoringCampus(policy, session.group_id, session.group?.name);
  const campus = getTutoringCampus(
    policy, session.group_id, session.group?.name, session.campus_override
  );
  const save = useMutation({
    mutationFn: () =>
      updateTutoringSession(wsId, session.id, { campusOverride: draft }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['tutoring-sessions', wsId] });
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-parent-message', wsId, session.id],
      });
    },
  });
  if (!canManage) return <span>{campus ?? '—'}</span>;
  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('campus_edit')}
        onClick={() => {
          setDraft(session.campus_override ?? '');
          setEditing(true);
          save.reset();
        }}
      >
        {campus ?? '—'}
      </Button>
    );
  }
  return (
    <div className="space-y-1">
      <Input
        aria-label={t('campus')}
        maxLength={TUTORING_CAMPUS_LABEL_MAX_LENGTH}
        placeholder={inherited ?? t('campus_inherit_class')}
        value={draft}
        disabled={save.isPending}
        onChange={(event) => setDraft(event.target.value)}
      />
      <p className="text-muted-foreground text-xs">{t('campus_inherit_class')}</p>
      <div className="flex gap-1">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {t('campus_save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={save.isPending}
          onClick={() => setEditing(false)}
        >
          {t('campus_cancel')}
        </Button>
      </div>
      {save.isError ? (
        <p role="alert" className="text-destructive text-xs">
          {t('campus_save_failed')}
        </p>
      ) : null}
    </div>
  );
}
