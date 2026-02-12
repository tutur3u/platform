'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  type TimeValidationResult,
  validateNotFuture,
  validateTimeRange,
} from '@tuturuuu/hooks/utils/time-validation';
import { toast } from '@tuturuuu/ui/sonner';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { SessionWithRelations } from '../../types';
import type { ActionStates, EditFormState } from './session-types';

/**
 * Converts a TimeValidationErrorCode to a localized error message
 * This can be used by components that don't have access to the hook
 */

dayjs.extend(utc);
dayjs.extend(timezone);

interface UseSessionActionsProps {
  wsId: string;
}

interface UseSessionActionsReturn {
  // Action states
  actionStates: ActionStates;
  isDeleting: boolean;
  isEditing: boolean;
  isMoving: boolean;

  // Dialog states
  sessionToDelete: SessionWithRelations | null;
  sessionToEdit: SessionWithRelations | null;
  sessionToMove: SessionWithRelations | null;

  // Edit form state
  editFormState: EditFormState;
  originalValues: EditFormState | null;

  // Missed entry state
  showMissedEntryDialog: boolean;
  prefillStartTime: string;
  prefillEndTime: string;

  // Actions
  resumeSession: (session: SessionWithRelations | undefined) => Promise<void>;
  openEditDialog: (session: SessionWithRelations | undefined) => void;
  closeEditDialog: () => void;
  saveEdit: () => Promise<void>;
  setSessionToDelete: (session: SessionWithRelations | null) => void;
  deleteSession: () => Promise<void>;
  openMoveDialog: (session: SessionWithRelations | undefined) => void;
  handleMoveSession: (targetWorkspaceId: string) => Promise<void>;
  closeMoveDialog: () => void;
  openMissedEntryDialog: () => void;
  setShowMissedEntryDialog: (show: boolean) => void;

  // Confirmation state
  showResumeConfirmation: boolean;
  setShowResumeConfirmation: (show: boolean) => void;
  pendingResumeSession: SessionWithRelations | null;

  // Form state setters
  setEditFormState: <K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K]
  ) => void;
  getValidationErrorMessage: (result: TimeValidationResult) => string;
}

export function useSessionActions({
  wsId,
}: UseSessionActionsProps): UseSessionActionsReturn {
  const t = useTranslations('time-tracker.session_history');
  const router = useRouter();
  const queryClient = useQueryClient();

  // Action states
  const [actionStates, setActionStates] = useState<ActionStates>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  // Confirmation states
  const [showResumeConfirmation, setShowResumeConfirmation] = useState(false);
  const [pendingResumeSession, setPendingResumeSession] =
    useState<SessionWithRelations | null>(null);

  // Dialog states
  const [sessionToDelete, setSessionToDelete] =
    useState<SessionWithRelations | null>(null);
  const [sessionToEdit, setSessionToEdit] =
    useState<SessionWithRelations | null>(null);
  const [sessionToMove, setSessionToMove] =
    useState<SessionWithRelations | null>(null);

  // Missed entry state
  const [showMissedEntryDialog, setShowMissedEntryDialog] = useState(false);
  const [prefillStartTime, setPrefillStartTime] = useState('');
  const [prefillEndTime, setPrefillEndTime] = useState('');

  // Edit form state
  const [editFormState, setEditFormStateInternal] = useState<EditFormState>({
    title: '',
    description: '',
    categoryId: '',
    taskId: '',
    startTime: '',
    endTime: '',
  });
  const [originalValues, setOriginalValues] = useState<EditFormState | null>(
    null
  );

  const getValidationErrorMessage = useCallback(
    (result: TimeValidationResult): string => {
      if (!result.errorCode) return '';

      const params = result.errorParams || {};
      const dateTime = params.dateTime ?? '';

      switch (result.errorCode) {
        case 'FUTURE_START_TIME':
          return t('validation_future_start_time', { dateTime });
        case 'FUTURE_END_TIME':
          return t('validation_future_end_time', { dateTime });
        case 'FUTURE_DATE_TIME':
          return t('validation_future_date_time', { dateTime });
        case 'END_BEFORE_START':
          return t('validation_end_before_start');
        case 'DURATION_TOO_SHORT':
          return t('validation_duration_too_short');
        default:
          return t('validation_invalid_time');
      }
    },
    [t]
  );

  const setEditFormState = useCallback(
    <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => {
      setEditFormStateInternal((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const invalidateTimeTrackerQueries = useCallback(
    async (workspaceId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['running-time-session', workspaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['time-tracking-sessions', workspaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['time-tracker-stats', workspaceId],
        }),
      ]);
    },
    [queryClient]
  );

  const resumeSession = useCallback(
    async (session: SessionWithRelations | undefined) => {
      if (!session) return;

      setActionStates((prev) => ({ ...prev, [`resume-${session.id}`]: true }));
      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
          { method: 'PATCH', body: JSON.stringify({ action: 'resume' }) }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to resume session');
        }

        // Invalidate relevant queries
        await invalidateTimeTrackerQueries(wsId);

        router.refresh();
        toast.success(t('started_new_session', { title: session.title }));
        setShowResumeConfirmation(false);
        setPendingResumeSession(null);
      } catch (error) {
        console.error('Error resuming session:', error);
        const errorMessage =
          error instanceof Error ? error.message : t('failed_to_start_session');
        toast.error(errorMessage);
      } finally {
        setActionStates((prev) => ({
          ...prev,
          [`resume-${session.id}`]: false,
        }));
      }
    },
    [wsId, router, t, invalidateTimeTrackerQueries]
  );

  const openEditDialog = useCallback(
    (session: SessionWithRelations | undefined) => {
      if (!session) return;
      setSessionToEdit(session);

      const userTz = dayjs.tz.guess();
      const startTimeFormatted = dayjs
        .utc(session.start_time)
        .tz(userTz)
        .format('YYYY-MM-DDTHH:mm');
      const endTimeFormatted = session.end_time
        ? dayjs.utc(session.end_time).tz(userTz).format('YYYY-MM-DDTHH:mm')
        : '';

      const title = session.title;
      const description = session.description || '';
      const categoryId = session.category_id || 'none';
      const taskId = session.task_id || 'none';

      // Set current edit values
      setEditFormStateInternal({
        title,
        description,
        categoryId,
        taskId,
        startTime: startTimeFormatted,
        endTime: endTimeFormatted,
      });

      // Store original values for comparison
      setOriginalValues({
        title,
        description,
        categoryId,
        taskId,
        startTime: startTimeFormatted,
        endTime: endTimeFormatted,
      });
    },
    []
  );

  const closeEditDialog = useCallback(() => {
    setSessionToEdit(null);
    setOriginalValues(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!sessionToEdit || !originalValues) return;
    setIsEditing(true);
    try {
      const userTz = dayjs.tz.guess();

      // Validate future dates for time edits
      if (
        editFormState.startTime !== originalValues.startTime &&
        editFormState.startTime
      ) {
        const startValidation = validateNotFuture(editFormState.startTime);
        if (!startValidation.isValid) {
          toast.error(getValidationErrorMessage(startValidation));
          setIsEditing(false);
          return;
        }
      }

      if (
        editFormState.endTime !== originalValues.endTime &&
        editFormState.endTime
      ) {
        const endValidation = validateNotFuture(editFormState.endTime);
        if (!endValidation.isValid) {
          toast.error(getValidationErrorMessage(endValidation));
          setIsEditing(false);
          return;
        }
      }

      // Validate time range if both times are changing
      const newStartTime =
        editFormState.startTime !== originalValues.startTime
          ? editFormState.startTime
          : dayjs
              .utc(sessionToEdit.start_time)
              .tz(userTz)
              .format('YYYY-MM-DDTHH:mm');

      const newEndTime =
        editFormState.endTime !== originalValues.endTime
          ? editFormState.endTime
          : sessionToEdit.end_time
            ? dayjs
                .utc(sessionToEdit.end_time)
                .tz(userTz)
                .format('YYYY-MM-DDTHH:mm')
            : null;

      if (newStartTime && newEndTime) {
        const rangeValidation = validateTimeRange(newStartTime, newEndTime);
        if (!rangeValidation.isValid) {
          toast.error(getValidationErrorMessage(rangeValidation));
          setIsEditing(false);
          return;
        }
      }

      // Build only the fields that have changed
      const changes: {
        action: string;
        title?: string;
        description?: string;
        categoryId?: string | null;
        taskId?: string | null;
        startTime?: string;
        endTime?: string;
      } = {
        action: 'edit',
      };

      // Check each field for changes and only include dirty fields
      if (editFormState.title !== originalValues.title) {
        changes.title = editFormState.title;
      }

      if (editFormState.description !== originalValues.description) {
        changes.description = editFormState.description;
      }

      const currentCategoryId =
        editFormState.categoryId === 'none'
          ? null
          : editFormState.categoryId || null;
      const originalCategoryId =
        originalValues.categoryId === 'none'
          ? null
          : originalValues.categoryId || null;
      if (currentCategoryId !== originalCategoryId) {
        changes.categoryId = currentCategoryId;
      }

      const currentTaskId =
        editFormState.taskId === 'none' ? null : editFormState.taskId || null;
      const originalTaskId =
        originalValues.taskId === 'none' ? null : originalValues.taskId || null;
      if (currentTaskId !== originalTaskId) {
        changes.taskId = currentTaskId;
      }

      if (editFormState.startTime !== originalValues.startTime) {
        changes.startTime = editFormState.startTime
          ? dayjs.tz(editFormState.startTime, userTz).utc().toISOString()
          : undefined;
      }

      if (editFormState.endTime !== originalValues.endTime) {
        changes.endTime = editFormState.endTime
          ? dayjs.tz(editFormState.endTime, userTz).utc().toISOString()
          : undefined;
      }

      // Only make the request if there are actual changes
      if (Object.keys(changes).length === 1) {
        // Only the 'action' field is present, no actual changes
        closeEditDialog();
        toast.info(t('no_changes_detected'));
        return;
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToEdit.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(changes),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update session');
      }

      // Invalidate relevant queries
      await invalidateTimeTrackerQueries(wsId);

      router.refresh();
      closeEditDialog();
      toast.success(t('session_updated_successfully'));
    } catch (error) {
      console.error('Error updating session:', error);
      const errorMessage =
        error instanceof Error ? error.message : t('failed_to_update_session');
      toast.error(errorMessage);
    } finally {
      setIsEditing(false);
    }
  }, [
    sessionToEdit,
    originalValues,
    editFormState,
    wsId,
    router,
    t,
    closeEditDialog,
    getValidationErrorMessage,
    invalidateTimeTrackerQueries,
  ]);

  const deleteSession = useCallback(async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToDelete.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete session');
      }

      // Invalidate relevant queries
      await invalidateTimeTrackerQueries(wsId);

      setSessionToDelete(null);
      router.refresh();
      toast.success(t('session_deleted_successfully'));
    } catch (error) {
      console.error('Error deleting session:', error);
      const errorMessage =
        error instanceof Error ? error.message : t('failed_to_delete_session');
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  }, [sessionToDelete, wsId, router, t, invalidateTimeTrackerQueries]);

  const openMoveDialog = useCallback(
    (session: SessionWithRelations | undefined) => {
      if (!session) return;
      if (session.is_running) {
        toast.error(t('cannot_move_running'));
        return;
      }
      setSessionToMove(session);
    },
    [t]
  );

  const closeMoveDialog = useCallback(() => {
    setSessionToMove(null);
  }, []);

  const handleMoveSession = useCallback(
    async (targetWorkspaceId: string) => {
      if (!sessionToMove) return;

      setIsMoving(true);
      try {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToMove.id}/move`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              targetWorkspaceId,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to move session');
        }

        const result = await response.json();

        // Invalidate queries for both source and target workspaces
        await Promise.all([
          invalidateTimeTrackerQueries(wsId),
          invalidateTimeTrackerQueries(targetWorkspaceId),
        ]);

        router.refresh();
        setSessionToMove(null);
        toast.success(result.message || t('session_moved_successfully'));
      } catch (error) {
        console.error('Error moving session:', error);
        const errorMessage =
          error instanceof Error ? error.message : t('failed_to_move_session');
        toast.error(errorMessage);
      } finally {
        setIsMoving(false);
      }
    },
    [sessionToMove, wsId, router, t, invalidateTimeTrackerQueries]
  );

  const openMissedEntryDialog = useCallback(() => {
    // Pre-fill with current date and time for convenience
    const now = dayjs();
    const oneHourAgo = now.subtract(1, 'hour');

    // Pass pre-filled times to the MissedEntryDialog via state
    setPrefillStartTime(oneHourAgo.format('YYYY-MM-DDTHH:mm'));
    setPrefillEndTime(now.format('YYYY-MM-DDTHH:mm'));
    setShowMissedEntryDialog(true);
  }, []);

  return {
    // Action states
    actionStates,
    isDeleting,
    isEditing,
    isMoving,

    // Dialog states
    sessionToDelete,
    sessionToEdit,
    sessionToMove,

    // Edit form state
    editFormState,
    originalValues,

    // Missed entry state
    showMissedEntryDialog,
    prefillStartTime,
    prefillEndTime,

    // Actions
    resumeSession,
    openEditDialog,
    closeEditDialog,
    saveEdit,
    setSessionToDelete,
    deleteSession,
    openMoveDialog,
    handleMoveSession,
    closeMoveDialog,
    openMissedEntryDialog,
    setShowMissedEntryDialog,
    getValidationErrorMessage,

    // Confirmation state
    showResumeConfirmation,
    setShowResumeConfirmation,
    pendingResumeSession,

    // Form state setters
    setEditFormState,
  };
}
