import { AlertCircle, AlertTriangle } from '@tuturuuu/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
import { ImageUploadSection } from '../../requests/components/image-upload-section';
import { useUserWorkspaces } from '../use-user-workspaces';
import { useWorkspaceCategories } from '../use-workspace-categories';
import { useWorkspaceTasks } from '../use-workspace-tasks';
import { ActionButtons } from './components/action-buttons';
import { ChainSummaryBanner } from './components/chain-summary-banner';
import { DurationDisplay } from './components/duration-display';
import { SessionInfoBanner } from './components/session-info-banner';
import { TimeEntryForm } from './components/time-entry-form';
import { TimePresets } from './components/time-presets';
import { ValidationErrors } from './components/validation-errors';
import { WorkspaceSelector } from './components/workspace-selector';
import type { MissedEntryDialogProps } from './types';
import { useMissedEntryForm } from './use-missed-entry-form';

export default function MissedEntryDialog(props: MissedEntryDialogProps) {
  const { open, categories, wsId, mode = 'normal' } = props;

  const t = useTranslations('time-tracker.missed_entry_dialog');

  // Mode-specific props
  const isExceededMode = mode === 'exceeded-session';
  const isChainMode = mode === 'exceeded-session-chain';
  const isNormalMode = !isExceededMode && !isChainMode;

  const session = isExceededMode || isChainMode ? props.session : undefined;
  const chainSummary = isChainMode ? props.chainSummary : undefined;
  const providedThresholdDays =
    isExceededMode || isChainMode ? props.thresholdDays : undefined;

  // Use form hook
  const form = useMissedEntryForm(props);

  // Fetch user workspaces for workspace selector (only in normal mode)
  const { data: userWorkspaces, isLoading: isLoadingWorkspaces } =
    useUserWorkspaces({
      enabled: open && isNormalMode,
    });

  // Fetch categories for the selected workspace
  const { data: workspaceCategories, isLoading: isLoadingCategories } =
    useWorkspaceCategories({
      wsId: open ? form.effectiveWsId : null,
      enabled: open,
      initialData: form.effectiveWsId === wsId ? categories : undefined,
    });

  // Fetch tasks for the selected workspace
  const { data: tasks, isLoading: isLoadingTasks } = useWorkspaceTasks({
    wsId: open ? form.effectiveWsId : null,
    enabled: open,
  });

  // Only fetch threshold in normal mode (exceeded mode provides it)
  const {
    data: fetchedThresholdData,
    isLoading: isLoadingThreshold,
    isError: isErrorThreshold,
  } = useWorkspaceTimeThreshold(
    isExceededMode || isChainMode ? null : form.effectiveWsId
  );

  // Use provided threshold in exceeded mode, fetched in normal mode
  const thresholdDays =
    isExceededMode || isChainMode
      ? providedThresholdDays
      : fetchedThresholdData?.threshold;

  // Check if start time is older than threshold
  const isStartTimeOlderThanThreshold = useMemo(() => {
    if (isExceededMode) return true;
    if (!form.missedEntryStartTime) return false;
    if (isLoadingThreshold || isErrorThreshold) return true;
    if (thresholdDays === null || thresholdDays === undefined) return false;
    if (thresholdDays === 0) return true;

    const startTime = dayjs(form.missedEntryStartTime);
    const thresholdAgo = dayjs().subtract(thresholdDays as number, 'day');
    return startTime.isBefore(thresholdAgo);
  }, [
    form.missedEntryStartTime,
    thresholdDays,
    isLoadingThreshold,
    isErrorThreshold,
    isExceededMode,
  ]);

  const isLoading = form.isCreatingMissedEntry || form.isDiscarding;

  // Image upload props for ImageUploadSection
  const imageUploadCommonProps = {
    images: form.images,
    imagePreviews: form.imagePreviews,
    isCompressing: form.isCompressing,
    isDragOver: form.isDragOver,
    imageError: form.imageError,
    canAddMore: form.canAddMoreImages,
    maxImages: 5,
    totalCount: form.totalImageCount,
    fileInputRef: form.fileInputRef,
    onDragOver: form.handleDragOver,
    onDragLeave: form.handleDragLeave,
    onDrop: form.handleDrop,
    onFileChange: form.handleImageUpload,
    onRemoveNew: form.removeImage,
    onRemoveExisting: () => {},
    labels: {
      proofOfWork: t('approval.proofOfWork', {
        current: form.totalImageCount,
        max: 5,
      }),
      compressing: t('approval.compressing'),
      dropImages: t('approval.dropImages'),
      clickToUpload: t('approval.clickToUpload'),
      imageFormats: t('approval.imageFormats'),
      proofImageAlt: t('approval.proofImageAlt'),
      existing: t('approval.existingImage'),
      new: t('approval.newImage'),
    },
  };

  const handleWorkspaceChange = (workspaceId: string) => {
    form.setSelectedWorkspaceId(workspaceId);
    form.setMissedEntryCategoryId('none');
    form.setMissedEntryTaskId('none');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isLoading) {
          form.closeMissedEntryDialog();
        }
      }}
    >
      <DialogContent
        className="mx-auto flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden p-0"
        onPointerDownOutside={(e) => {
          if (form.hasUnsavedChanges) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (form.hasUnsavedChanges) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (form.hasUnsavedChanges) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          {isExceededMode || isChainMode ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-dynamic-orange">
                <AlertTriangle className="h-5 w-5" />
                {isChainMode ? t('exceeded.chainTitle') : t('exceeded.title')}
              </DialogTitle>
              <DialogDescription>
                {isChainMode
                  ? t('exceeded.chainDescription')
                  : t('exceeded.description')}
              </DialogDescription>
            </>
          ) : (
            <DialogTitle>{t('title')}</DialogTitle>
          )}
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-6 py-4">
          {/* Session chain timeline - chain mode only */}
          {isChainMode && chainSummary && (
            <ChainSummaryBanner chainSummary={chainSummary} />
          )}

          {/* Session info banner - exceeded mode only (single session) */}
          {isExceededMode && !isChainMode && session && (
            <SessionInfoBanner
              session={session}
              thresholdDays={providedThresholdDays ?? null}
              currentTime={form.currentTime}
            />
          )}

          {/* Workspace selector - normal mode only */}
          {isNormalMode && (
            <WorkspaceSelector
              selectedWorkspaceId={form.selectedWorkspaceId}
              currentWorkspaceId={wsId}
              userWorkspaces={userWorkspaces}
              isLoadingWorkspaces={isLoadingWorkspaces}
              isLoading={isLoading}
              onWorkspaceChange={handleWorkspaceChange}
            />
          )}

          {/* Form fields */}
          <TimeEntryForm
            title={form.missedEntryTitle}
            description={form.missedEntryDescription}
            categoryId={form.missedEntryCategoryId}
            taskId={form.missedEntryTaskId}
            startTime={form.missedEntryStartTime}
            endTime={form.missedEntryEndTime}
            categories={workspaceCategories ?? null}
            tasks={tasks}
            isLoadingCategories={isLoadingCategories}
            isLoadingTasks={isLoadingTasks}
            isLoading={isLoading}
            validationErrors={form.validationErrors}
            onTitleChange={form.setMissedEntryTitle}
            onDescriptionChange={form.setMissedEntryDescription}
            onCategoryChange={form.setMissedEntryCategoryId}
            onTaskChange={form.setMissedEntryTaskId}
            onStartTimeChange={form.setMissedEntryStartTime}
            onEndTimeChange={form.setMissedEntryEndTime}
          />

          {/* Validation Errors */}
          <ValidationErrors errors={form.validationErrors} />

          {/* Warning and image upload for entries older than threshold */}
          {isStartTimeOlderThanThreshold && !isExceededMode && (
            <div className="space-y-4">
              <div className="rounded-lg border border-dynamic-orange bg-dynamic-orange/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-orange" />
                  <div className="text-sm">
                    <p className="font-medium text-dynamic-orange">
                      {t('approval.title')}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {isLoadingThreshold || thresholdDays === undefined
                        ? t('approval.loadingThreshold')
                        : thresholdDays === 0 || thresholdDays === null
                          ? t('approval.allEntries')
                          : t('approval.entriesOlderThan', {
                              days: thresholdDays,
                            })}
                    </p>
                  </div>
                </div>
              </div>

              <ImageUploadSection
                {...imageUploadCommonProps}
                disabled={form.isCreatingMissedEntry}
              />
            </div>
          )}

          {/* Image upload section for exceeded mode (always required) */}
          {isExceededMode && (
            <ImageUploadSection
              {...imageUploadCommonProps}
              disabled={isLoading}
            />
          )}

          {/* Quick time presets - hidden in exceeded mode */}
          {!isExceededMode && (
            <TimePresets
              onSelectPreset={(start, end) => {
                form.setMissedEntryStartTime(start);
                form.setMissedEntryEndTime(end);
              }}
              disabled={isLoading}
            />
          )}

          {/* Show calculated duration */}
          <DurationDisplay
            startTime={form.missedEntryStartTime}
            endTime={form.missedEntryEndTime}
          />
        </div>

        {/* Actions */}
        <ActionButtons
          mode={mode}
          isLoading={isLoading}
          isCreating={form.isCreatingMissedEntry}
          isDiscarding={form.isDiscarding}
          isStartTimeOlderThanThreshold={isStartTimeOlderThanThreshold}
          isLoadingThreshold={isLoadingThreshold}
          hasImages={form.images.length > 0}
          hasTitle={!!form.missedEntryTitle.trim()}
          hasStartTime={!!form.missedEntryStartTime}
          hasEndTime={!!form.missedEntryEndTime}
          hasValidationErrors={Object.keys(form.validationErrors).length > 0}
          onSubmit={() =>
            form.createMissedEntry(isStartTimeOlderThanThreshold, thresholdDays)
          }
          onCancel={form.closeMissedEntryDialog}
          onDiscard={form.handleDiscardSession}
        />
      </DialogContent>
    </Dialog>
  );
}
