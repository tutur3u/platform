'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { Ref } from 'react';
import type { FormsTranslator } from '../runtime/types';

export interface StudioSaveState {
  autosaveEnabled: boolean;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  isDirty: boolean;
  isPending: boolean;
  mode: 'create' | 'edit';
  secondsUntilAutosave: number;
}

/**
 * The save button's label carries the whole autosave state machine — pending,
 * failed, counting down, just-saved, create-vs-update. It is rendered in two
 * places (the header and the floating action), and the two copies had drifted
 * out of a single edit more than once, so the label lives here on its own.
 */
export function getStudioSaveLabel(state: StudioSaveState, t: FormsTranslator) {
  if (state.isPending) {
    return t('studio.saving');
  }

  if (state.autosaveStatus === 'error') {
    return t('studio.autosave_failed');
  }

  if (
    state.autosaveEnabled &&
    state.isDirty &&
    state.secondsUntilAutosave > 0
  ) {
    return t('studio.autosave_in_seconds', {
      seconds: state.secondsUntilAutosave,
    });
  }

  if (state.autosaveStatus === 'saved') {
    return t('studio.autosave_saved');
  }

  return state.mode === 'create'
    ? t('studio.create_form')
    : t('studio.save_changes');
}

export function StudioSaveButton({
  buttonRef,
  className,
  disabled,
  onClick,
  state,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  disabled: boolean;
  onClick: () => void;
  state: StudioSaveState;
}) {
  const t = useTranslations('forms');

  return (
    <Button
      className={cn('rounded-2xl px-5', className)}
      disabled={disabled}
      onClick={onClick}
      ref={buttonRef}
      type="button"
    >
      {getStudioSaveLabel(state, t)}
    </Button>
  );
}
