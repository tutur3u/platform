'use client';

import { useMutation } from '@tanstack/react-query';
import { createTutoringSession } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';
import { isTutoringContentRestricted } from './tutoring-errors';
import {
  findSessionSlotConflicts,
  type TutoringFormValues,
} from './tutoring-types';
import type { useTutoringHandoff } from './use-tutoring-handoff';

type Handoff = ReturnType<typeof useTutoringHandoff>;

/**
 * Make-up content left as drafted from the lesson notes is saved empty, so the
 * server keeps following the class notes until the session is completed.
 */
export function storedTutoringContent(
  draft: Pick<TutoringFormValues, 'content' | 'linkedContent' | 'reasonType'>
) {
  if (
    draft.reasonType === 'ABSENT_RECOVERY' &&
    draft.content.trim() === (draft.linkedContent ?? '').trim()
  )
    return '';
  return draft.content;
}

type SessionSlot = TutoringFormValues['sessionSlots'][number];

/**
 * Mirrors the server's `pairSessionsWithAbsences`: slots in date and time
 * order each take the oldest uncovered absence on or before their date, and a
 * slot dated before the next absence takes none (so later slots move up).
 * Pending reservations already on the student can shift the server's pairing
 * further; this covers it as far as the client can know.
 */
function simulatePairing(slots: SessionSlot[], missedDates: string[]) {
  const absences = [...missedDates].sort();
  const ordered = [...slots.keys()].sort(
    (a, b) =>
      (slots[a]?.sessionDate ?? '').localeCompare(
        slots[b]?.sessionDate ?? ''
      ) ||
      (slots[a]?.startTime ?? '').localeCompare(slots[b]?.startTime ?? '') ||
      a - b
  );
  const paired = new Map<number, string>();
  let consumed = 0;
  for (const index of ordered) {
    const next = absences[consumed];
    const date = slots[index]?.sessionDate ?? '';
    if (next === undefined || !date || next > date) continue;
    paired.set(index, next);
    consumed += 1;
  }
  return paired;
}

/**
 * Whether the server will pair this slot with the missed date it was drafted
 * for. Slots sharing a date and time are ordered by row id on the server,
 * which the client cannot know, so they always save their text as shown.
 */
function followsPairedDate(
  slots: SessionSlot[],
  missedDates: string[],
  index: number
) {
  const slot = slots[index];
  if (!slot?.pairedMissedDate) return false;
  const tied = slots.some(
    (other, otherIndex) =>
      otherIndex !== index &&
      other.sessionDate === slot.sessionDate &&
      other.startTime === slot.startTime
  );
  if (tied) return false;
  return (
    simulatePairing(slots, missedDates).get(index) === slot.pairedMissedDate
  );
}

/**
 * The sessions to create. A slot with its own content sends it; one without
 * leaves the field out so the server applies the shared `content`. Linked
 * make-up text is saved empty only while the slot still follows the missed
 * date it shows (see `followsPairedDate`); otherwise the text is saved as shown.
 */
export function storedTutoringSessions(
  draft: Pick<
    TutoringFormValues,
    'missedClassDates' | 'reasonType' | 'sessionSlots'
  >
): Omit<SessionSlot, 'linkedContent' | 'pairedMissedDate'>[] {
  const missedDates = draft.missedClassDates ?? [];
  return draft.sessionSlots.map((slot, index) => {
    const { content, linkedContent, pairedMissedDate, ...timing } = slot;
    if (content === undefined) return timing;
    return {
      ...timing,
      content: followsPairedDate(draft.sessionSlots, missedDates, index)
        ? storedTutoringContent({
            content,
            linkedContent,
            reasonType: draft.reasonType,
          })
        : content,
    };
  });
}

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
        content: storedTutoringContent(draft),
        groupId: draft.groupId,
        reasonDetail: draft.reasonDetail,
        reasonType: draft.reasonType,
        sessions: storedTutoringSessions(draft),
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
      if (!current(intent)) return;
      if (isTutoringContentRestricted(error))
        toast.error(t('content_restricted'));
      else
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
