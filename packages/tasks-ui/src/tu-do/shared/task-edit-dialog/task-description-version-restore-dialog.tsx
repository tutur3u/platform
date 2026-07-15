'use client';

import { Clock, Eye, Loader2, RotateCcw } from '@tuturuuu/icons';
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
import { DescriptionDiffViewer } from './description-diff-viewer';
import type { RecoverableTaskDescriptionVersion } from './description-versions';

interface TaskDescriptionVersionRestoreDialogProps {
  currentDescription: string | null;
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
  versions: RecoverableTaskDescriptionVersion[];
}

export function TaskDescriptionVersionRestoreDialog({
  currentDescription,
  isOpen,
  locale = 'en',
  onClose,
  onRestoreVersion,
  restoringVersionId,
  t,
  versions,
}: TaskDescriptionVersionRestoreDialogProps) {
  const dateLocale = locale === 'vi' ? vi : enUS;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid max-h-[85vh] w-full max-w-2xl grid-rows-[auto_1fr] overflow-hidden md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('description_versions_title', {
              defaultValue: 'Description versions',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('description_versions_description', {
              defaultValue:
                'Compare tracked description versions and restore the one that should be current.',
            })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-6 min-h-0 px-6">
          <div className="space-y-3 py-4">
            {versions.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
                {t('no_recoverable_description_versions', {
                  defaultValue:
                    'No restorable description versions were found in history.',
                })}
              </div>
            ) : (
              versions.map((version, index) => {
                const isRestoring = restoringVersionId === version.id;
                const time = new Date(version.changedAt);
                const exactTime = format(time, 'PPpp', {
                  locale: dateLocale,
                });
                const relativeTime = formatDistanceToNow(time, {
                  addSuffix: true,
                  locale: dateLocale,
                });

                return (
                  <div
                    className="rounded-md border bg-card p-3"
                    key={version.id}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {index === 0 && (
                            <Badge variant="secondary">
                              {t('latest_version', {
                                defaultValue: 'Latest',
                              })}
                            </Badge>
                          )}
                          {version.reason === 'before_clear' && (
                            <Badge
                              className="border-dynamic-orange/30 text-dynamic-orange"
                              variant="outline"
                            >
                              {t('before_clear_version', {
                                defaultValue: 'Before clear',
                              })}
                            </Badge>
                          )}
                          <span
                            className="inline-flex items-center gap-1 text-muted-foreground text-xs"
                            title={exactTime}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            {relativeTime}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm">
                          {version.previewText ||
                            t('description_version_no_preview', {
                              defaultValue: 'No text preview',
                            })}
                        </p>
                        {version.user?.name && (
                          <p className="text-muted-foreground text-xs">
                            {t('tracked_by_user', {
                              defaultValue: 'Tracked by',
                            })}
                            {` ${version.user.name}`}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <DescriptionDiffViewer
                          newValue={version.description}
                          oldValue={currentDescription}
                          t={t}
                          trigger={
                            <Button
                              className="h-8 gap-1.5 px-2.5 text-xs"
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t('compare_version', {
                                defaultValue: 'Compare',
                              })}
                            </Button>
                          }
                        />
                        <Button
                          className="h-8 gap-1.5 px-2.5 text-xs"
                          disabled={!!restoringVersionId}
                          onClick={() => onRestoreVersion(version)}
                          size="sm"
                          type="button"
                        >
                          {isRestoring ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          {t('restore_version', {
                            defaultValue: 'Restore',
                          })}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
