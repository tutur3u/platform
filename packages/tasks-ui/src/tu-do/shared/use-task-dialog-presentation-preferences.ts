'use client';

import { useQuery } from '@tanstack/react-query';
import { getUserConfig } from '@tuturuuu/internal-api/users';
import {
  normalizeTaskDialogPresentation,
  TASK_DIALOG_CREATE_PRESENTATION_CONFIG_ID,
  TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
  TASK_DIALOG_EDIT_PRESENTATION_CONFIG_ID,
  TASK_DOCUMENT_CREATE_PRESENTATION_CONFIG_ID,
  TASK_DOCUMENT_EDIT_PRESENTATION_CONFIG_ID,
  type TaskDialogPresentation,
  type TaskDialogPresentationPreferences,
} from './task-dialog-presentation';

function usePresentationConfig(
  configId: string,
  fallback: TaskDialogPresentation
) {
  const { data } = useQuery({
    queryKey: ['user-config', configId],
    queryFn: async () => (await getUserConfig(configId)).value ?? null,
    staleTime: 5 * 60 * 1000,
  });
  return normalizeTaskDialogPresentation(data, fallback);
}

export function useTaskDialogPresentationPreferences(): TaskDialogPresentationPreferences {
  const legacyTaskDefault = usePresentationConfig(
    TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
    'focused'
  );
  return {
    taskCreate: usePresentationConfig(
      TASK_DIALOG_CREATE_PRESENTATION_CONFIG_ID,
      'compact'
    ),
    taskEdit: usePresentationConfig(
      TASK_DIALOG_EDIT_PRESENTATION_CONFIG_ID,
      legacyTaskDefault
    ),
    documentCreate: usePresentationConfig(
      TASK_DOCUMENT_CREATE_PRESENTATION_CONFIG_ID,
      'compact'
    ),
    documentEdit: usePresentationConfig(
      TASK_DOCUMENT_EDIT_PRESENTATION_CONFIG_ID,
      'fullscreen'
    ),
  };
}
