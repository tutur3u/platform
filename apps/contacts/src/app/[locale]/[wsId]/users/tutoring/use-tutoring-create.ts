'use client';

import { useMutation } from '@tanstack/react-query';
import { createTutoringSession } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';
import {
  findSessionSlotConflicts,
  type TutoringFormValues,
} from './tutoring-types';
import type { useTutoringHandoff } from './use-tutoring-handoff';

type Handoff = ReturnType<typeof useTutoringHandoff>;
interface Intent {
  scope: Handoff['scope'];
  current: () => boolean;
  form: TutoringFormValues;
  onSaved: () => void;
}

/** A dispatched write remains admitted; only its original draft owns effects. */
export function useTutoringCreate({
  form,
  handoff,
  onSaved,
}: {
  form: TutoringFormValues;
  handoff: Handoff;
  onSaved: () => void;
}) {
  const t = useTranslations('ws-tutoring');
  const state = useRef<{
    active: boolean;
    scope: Handoff['scope'];
    owner: Intent | null;
  }>({ active: false, scope: handoff.scope, owner: null });
  const current = (intent: Intent) =>
    state.current.active &&
    state.current.scope === intent.scope &&
    state.current.owner === intent &&
    intent.current();
  const mutation = useMutation({
    mutationFn: async (intent: Intent) => {
      if (!current(intent)) return null;
      const draft = intent.form;
      if (
        !draft.groupId ||
        !draft.studentUserId ||
        draft.sessionSlots.length < 1
      )
        throw new Error(t('missing_required'));
      for (const slot of draft.sessionSlots) {
        if (!(slot.sessionDate && slot.startTime))
          throw new Error(t('missing_required'));
        if (slot.durationMinutes < 1 || slot.durationMinutes > 480)
          throw new Error(t('invalid_duration'));
      }
      const conflict = findSessionSlotConflicts(draft)[0];
      if (conflict) {
        const values = {
          slotA: conflict.firstIndex + 1,
          slotB: conflict.secondIndex + 1,
        };
        throw new Error(
          conflict.conflictType === 'teacher'
            ? t('conflict_teacher_slots', values)
            : t('conflict_student_slots', values)
        );
      }
      if (!current(intent)) return null;
      return createTutoringSession(intent.scope.wsId, {
        content: draft.content,
        groupId: draft.groupId,
        reasonDetail: draft.reasonDetail,
        reasonType: draft.reasonType,
        sessions: draft.sessionSlots,
        sourceFeedbackId: draft.sourceFeedbackId ?? null,
        studentUserId: draft.studentUserId,
      });
    },
    onSuccess: (result, intent) => {
      if (!result || !current(intent)) return;
      toast.success(
        result.createdCount > 1
          ? t('created_multiple', { count: result.createdCount })
          : t('created')
      );
      intent.onSaved();
    },
    onError: (error, intent) => {
      if (current(intent))
        toast.error(
          error instanceof Error ? error.message : t('create_failed')
        );
    },
    onSettled: (_result, _error, intent) => {
      if (state.current.owner === intent) state.current.owner = null;
    },
  });
  const reset = mutation.reset;
  useLayoutEffect(() => {
    state.current = { active: true, scope: handoff.scope, owner: null };
    // Reset the observer, never cancel or roll back an already dispatched write.
    reset();
    return () => {
      state.current.active = false;
      state.current.owner = null;
    };
  }, [handoff.scope, reset]);

  const submit = () => {
    if (
      !state.current.active ||
      state.current.scope !== handoff.scope ||
      state.current.owner
    )
      return;
    const intent: Intent = {
      scope: handoff.scope,
      current: handoff.begin(),
      form: {
        ...form,
        sessionSlots: form.sessionSlots.map((slot) => ({ ...slot })),
      },
      onSaved,
    };
    if (!intent.current()) return;
    state.current.owner = intent;
    mutation.mutate(intent);
  };
  return { submit, isPending: mutation.isPending };
}
