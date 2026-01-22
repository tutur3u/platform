'use client';

import {
  AlertTriangle,
  Check,
  CheckCircle,
  GitMerge,
  Loader2,
  Users,
  XCircle,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type {
  AutoSelectStrategy,
  BalanceStrategy,
  BulkMergePair,
  DuplicateGroup,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useBulkMergePreview, useBulkMergeWorkspaceUsers } from './hooks';

interface Props {
  wsId: string;
  duplicates: DuplicateGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function BulkMergeDialog({
  wsId,
  duplicates,
  open,
  onOpenChange,
  onComplete,
}: Props) {
  const t = useTranslations('ws-users');
  const tc = useTranslations('common');

  // Selection state
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [autoSelectStrategy, setAutoSelectStrategy] =
    useState<AutoSelectStrategy>('oldest');
  const [balanceStrategy, setBalanceStrategy] =
    useState<BalanceStrategy>('keep');
  const [confirmed, setConfirmed] = useState(false);

  // Results state
  const [isComplete, setIsComplete] = useState(false);
  const [results, setResults] = useState<{
    successCount: number;
    failureCount: number;
  } | null>(null);

  // Generate merge pairs based on selection and strategy
  const mergePairs = useMemo((): BulkMergePair[] => {
    const pairs: BulkMergePair[] = [];

    for (const group of duplicates) {
      const groupKey = `${group.duplicateField}-${group.duplicateKey}`;
      if (!selectedGroups.has(groupKey)) continue;

      if (group.users.length < 2) continue;

      // Apply auto-select strategy to determine keep/delete
      const sortedUsers = [...group.users].sort((a, b) => {
        switch (autoSelectStrategy) {
          case 'oldest':
            return (
              new Date(a.created_at || 0).getTime() -
              new Date(b.created_at || 0).getTime()
            );
          case 'newest':
            return (
              new Date(b.created_at || 0).getTime() -
              new Date(a.created_at || 0).getTime()
            );
          case 'most_data':
            return countNonNullFields(b) - countNonNullFields(a);
          default:
            return 0;
        }
      });

      // Keep the first (best by strategy), delete the rest
      const keepUser = sortedUsers[0];
      for (let i = 1; i < sortedUsers.length; i++) {
        pairs.push({
          keepUserId: keepUser!.id,
          deleteUserId: sortedUsers[i]!.id,
        });
      }
    }

    return pairs;
  }, [duplicates, selectedGroups, autoSelectStrategy]);

  // Fetch preview
  const {
    data: preview,
    isLoading: isLoadingPreview,
    error: previewError,
  } = useBulkMergePreview(wsId, mergePairs, {
    enabled: open && mergePairs.length > 0,
  });

  const bulkMergeMutation = useBulkMergeWorkspaceUsers(wsId);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedGroups(new Set());
      setAutoSelectStrategy('oldest');
      setBalanceStrategy('keep');
      setConfirmed(false);
      setIsComplete(false);
      setResults(null);
    }
  }, [open]);

  const handleSelectAll = () => {
    if (selectedGroups.size === duplicates.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(
        new Set(duplicates.map((g) => `${g.duplicateField}-${g.duplicateKey}`))
      );
    }
  };

  const handleToggleGroup = (groupKey: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const handleMerge = async () => {
    if (!confirmed || mergePairs.length === 0) return;

    try {
      const result = await bulkMergeMutation.mutateAsync({
        pairs: mergePairs,
        balanceStrategy,
      });

      setResults({
        successCount: result.successCount,
        failureCount: result.failureCount,
      });
      setIsComplete(true);

      if (result.failureCount === 0) {
        toast.success(
          t('duplicates.bulk_merge_success', { count: result.successCount })
        );
      } else {
        toast.warning(
          t('duplicates.bulk_merge_partial', {
            success: result.successCount,
            failed: result.failureCount,
          })
        );
      }
    } catch (error) {
      console.error('Bulk merge error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('duplicates.bulk_merge_error')
      );
    }
  };

  const handleClose = () => {
    if (isComplete) {
      onComplete();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            {t('duplicates.bulk_merge_title')}
          </DialogTitle>
          <DialogDescription>
            {t('duplicates.bulk_merge_description')}
          </DialogDescription>
        </DialogHeader>

        {isComplete ? (
          <div className="flex flex-col items-center justify-center py-8">
            {results?.failureCount === 0 ? (
              <CheckCircle className="h-16 w-16 text-dynamic-green" />
            ) : (
              <AlertTriangle className="h-16 w-16 text-dynamic-yellow" />
            )}
            <h3 className="mt-4 font-medium text-lg">
              {results?.failureCount === 0
                ? t('duplicates.bulk_merge_complete')
                : t('duplicates.bulk_merge_partial_complete')}
            </h3>
            <div className="mt-2 flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-dynamic-green">
                <Check className="h-4 w-4" />
                {results?.successCount} {t('duplicates.merged')}
              </span>
              {results?.failureCount ? (
                <span className="flex items-center gap-1 text-dynamic-red">
                  <XCircle className="h-4 w-4" />
                  {results.failureCount} {t('duplicates.failed')}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Strategy Selection */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('duplicates.auto_select_strategy')}</Label>
                  <Select
                    value={autoSelectStrategy}
                    onValueChange={(v) =>
                      setAutoSelectStrategy(v as AutoSelectStrategy)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oldest">
                        {t('duplicates.strategy_oldest')}
                      </SelectItem>
                      <SelectItem value="newest">
                        {t('duplicates.strategy_newest')}
                      </SelectItem>
                      <SelectItem value="most_data">
                        {t('duplicates.strategy_most_data')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    {t(`duplicates.strategy_${autoSelectStrategy}_desc`)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{t('duplicates.balance_strategy')}</Label>
                  <RadioGroup
                    value={balanceStrategy}
                    onValueChange={(v) =>
                      setBalanceStrategy(v as BalanceStrategy)
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="keep" id="bulk-balance-keep" />
                      <Label htmlFor="bulk-balance-keep">
                        {t('duplicates.balance_keep_short')}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="add" id="bulk-balance-add" />
                      <Label htmlFor="bulk-balance-add">
                        {t('duplicates.balance_add_short')}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              <Separator />

              {/* Group Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">
                    {t('duplicates.select_groups')}
                    <Badge variant="secondary" className="ml-2">
                      {selectedGroups.size} / {duplicates.length}
                    </Badge>
                  </h4>
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    {selectedGroups.size === duplicates.length
                      ? t('duplicates.deselect_all')
                      : t('duplicates.select_all')}
                  </Button>
                </div>

                <div className="space-y-2">
                  {duplicates.map((group) => {
                    const groupKey = `${group.duplicateField}-${group.duplicateKey}`;
                    const isSelected = selectedGroups.has(groupKey);

                    return (
                      <div
                        key={groupKey}
                        className={cn(
                          'flex items-center justify-between rounded-lg border p-3 transition-colors',
                          isSelected && 'border-primary bg-primary/5'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleGroup(groupKey)}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  group.duplicateField === 'email'
                                    ? 'border-dynamic-blue text-dynamic-blue'
                                    : 'border-dynamic-green text-dynamic-green'
                                )}
                              >
                                {group.duplicateField}
                              </Badge>
                              <span className="font-mono text-sm">
                                {group.duplicateKey}
                              </span>
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {group.users.length} {t('duplicates.users')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {group.users.slice(0, 3).map((user) => (
                            <div
                              key={user.id}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"
                              title={user.full_name || user.email || undefined}
                            >
                              {user.avatar_url ? (
                                <Image
                                  src={user.avatar_url}
                                  alt=""
                                  className="h-8 w-8 rounded-full object-cover"
                                  width={32}
                                  height={32}
                                />
                              ) : (
                                <Users className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          ))}
                          {group.users.length > 3 && (
                            <span className="text-muted-foreground text-xs">
                              +{group.users.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview Summary */}
              {mergePairs.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium">
                      {t('duplicates.preview_summary')}
                    </h4>
                    {isLoadingPreview ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('duplicates.loading_preview')}
                      </div>
                    ) : previewError ? (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {t('duplicates.preview_error')}
                        </AlertDescription>
                      </Alert>
                    ) : preview ? (
                      <div className="rounded-lg bg-muted p-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">
                              {t('duplicates.merges_to_perform')}:
                            </span>
                            <span className="ml-2 font-medium">
                              {mergePairs.length}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {t('duplicates.records_affected')}:
                            </span>
                            <span className="ml-2 font-medium">
                              {preview.totalAffectedRecords}
                            </span>
                          </div>
                        </div>
                        {preview.warnings.length > 0 && (
                          <Alert className="mt-4 border-dynamic-yellow bg-dynamic-yellow/10 [&>svg]:text-dynamic-yellow">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>{t('duplicates.warnings')}</AlertTitle>
                            <AlertDescription>
                              <ul className="list-disc pl-4 text-xs">
                                {preview.warnings.slice(0, 5).map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                                {preview.warnings.length > 5 && (
                                  <li>
                                    ...{preview.warnings.length - 5}{' '}
                                    {t('duplicates.more_warnings')}
                                  </li>
                                )}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              {/* Confirmation */}
              {mergePairs.length > 0 && (
                <>
                  <Separator />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bulk-confirm"
                      checked={confirmed}
                      onCheckedChange={(checked) =>
                        setConfirmed(checked === true)
                      }
                    />
                    <Label htmlFor="bulk-confirm" className="text-sm">
                      {t('duplicates.bulk_confirm_merge', {
                        count: mergePairs.length,
                      })}
                    </Label>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {isComplete ? tc('close') : tc('cancel')}
          </Button>
          {!isComplete && (
            <Button
              onClick={handleMerge}
              disabled={
                !confirmed ||
                mergePairs.length === 0 ||
                isLoadingPreview ||
                !!previewError ||
                bulkMergeMutation.isPending
              }
              className="gap-2"
            >
              {bulkMergeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4" />
              )}
              {t('duplicates.merge_all', { count: mergePairs.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper to count non-null fields for "most_data" strategy
function countNonNullFields(user: WorkspaceUser): number {
  let count = 0;
  const fields = [
    'full_name',
    'display_name',
    'email',
    'phone',
    'avatar_url',
    'birthday',
    'gender',
    'ethnicity',
    'guardian',
    'national_id',
    'address',
    'note',
  ] as const;

  for (const field of fields) {
    if (user[field as keyof WorkspaceUser]) count++;
  }

  return count;
}
