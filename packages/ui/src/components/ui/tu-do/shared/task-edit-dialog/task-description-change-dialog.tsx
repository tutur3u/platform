'use client';

import { Clock, Eye, FileText, Loader2, RotateCcw } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { format, formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useMemo } from 'react';
import { DescriptionDiffViewer } from './description-diff-viewer';
import {
  buildRecoverableTaskDescriptionVersions,
  extractRecoverableTaskDescriptionValue,
  type RecoverableTaskDescriptionVersion,
} from './description-versions';
import type { TaskHistoryEntry } from './task-activity-section';

interface TaskDescriptionChangeDialogProps {
  canRestore?: boolean;
  entry: TaskHistoryEntry;
  isOpen: boolean;
  locale?: string;
  onClose: () => void;
  onRestoreVersion: (
    version: RecoverableTaskDescriptionVersion
  ) => Promise<void> | void;
  restoringVersionId?: string | null;
  t: (
    key: string,
    options?: { count?: number; defaultValue?: string }
  ) => string;
}

export function TaskDescriptionChangeDialog({
  canRestore = true,
  entry,
  isOpen,
  locale = 'en',
  onClose,
  onRestoreVersion,
  restoringVersionId,
  t,
}: TaskDescriptionChangeDialogProps) {
  const dateLocale = locale === 'vi' ? vi : enUS;
  const versions = useMemo(
    () => buildRecoverableTaskDescriptionVersions([entry]),
    [entry]
  );
  const oldValue = useMemo(
    () => extractRecoverableTaskDescriptionValue(entry.old_value),
    [entry.old_value]
  );
  const newValue = useMemo(
    () => extractRecoverableTaskDescriptionValue(entry.new_value),
    [entry.new_value]
  );
  const time = new Date(entry.changed_at);
  const exactTime = format(time, 'PPpp', { locale: dateLocale });
  const relativeTime = formatDistanceToNow(time, {
    addSuffix: true,
    locale: dateLocale,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid max-h-[85vh] w-full max-w-2xl grid-rows-[auto_1fr] overflow-hidden md:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-purple/10">
              <FileText className="h-4 w-4 text-dynamic-purple" />
            </div>
            <div>
              <DialogTitle>
                {t('description_change_title', {
                  defaultValue: 'Description change',
                })}
              </DialogTitle>
              <DialogDescription className="text-xs">
                <span title={exactTime}>{relativeTime}</span>
                {' - '}
                {entry.user?.name ||
                  t('unknown_user', { defaultValue: 'Unknown user' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="-mx-6 min-h-0 px-6">
          <div className="space-y-4 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <DescriptionValuePreview
                emptyLabel={t('empty_description_value', {
                  defaultValue: 'Empty or not restorable',
                })}
                label={t('previous_description_value', {
                  defaultValue: 'Previous',
                })}
                preview={oldValue?.previewText}
              />
              <DescriptionValuePreview
                emptyLabel={t('empty_description_value', {
                  defaultValue: 'Empty or not restorable',
                })}
                label={t('resulting_description_value', {
                  defaultValue: 'Resulting',
                })}
                preview={newValue?.previewText}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DescriptionDiffViewer
                newValue={entry.new_value}
                oldValue={entry.old_value}
                t={t}
                trigger={
                  <Button
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t('view_description_diff', {
                      defaultValue: 'View diff',
                    })}
                  </Button>
                }
              />
              <span
                className="inline-flex items-center gap-1 text-muted-foreground text-xs"
                title={exactTime}
              >
                <Clock className="h-3.5 w-3.5" />
                {relativeTime}
              </span>
            </div>

            {canRestore && (
              <div className="space-y-2">
                <p className="font-medium text-sm">
                  {t('restore_from_change', {
                    defaultValue: 'Restore from this change',
                  })}
                </p>
                {versions.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
                    {t('no_recoverable_description_versions', {
                      defaultValue:
                        'No restorable description versions were found in history.',
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {versions.map((version) => {
                      const isRestoring = restoringVersionId === version.id;
                      return (
                        <Button
                          className="h-8 gap-1.5 px-2.5 text-xs"
                          disabled={!!restoringVersionId}
                          key={version.id}
                          onClick={() => onRestoreVersion(version)}
                          size="sm"
                          type="button"
                        >
                          {isRestoring ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          {version.source === 'old_value'
                            ? t('restore_previous_description', {
                                defaultValue: 'Restore previous',
                              })
                            : t('restore_resulting_description', {
                                defaultValue: 'Restore resulting',
                              })}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function DescriptionValuePreview({
  emptyLabel,
  label,
  preview,
}: {
  emptyLabel: string;
  label: string;
  preview?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary">{label}</Badge>
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap text-sm">
        {preview || <span className="text-muted-foreground">{emptyLabel}</span>}
      </p>
    </div>
  );
}
