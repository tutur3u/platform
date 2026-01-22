'use client';

import {
  AlertTriangle,
  Check,
  Database,
  GitMerge,
  Loader2,
  Users,
  X,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type {
  BalanceStrategy,
  FieldStrategy,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
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
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useMergeWorkspaceUsers, useWorkspaceUserMergePreview } from './hooks';

interface Props {
  wsId: string;
  keepUser: WorkspaceUser;
  deleteUser: WorkspaceUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMergeComplete: () => void;
}

// Fields that can be selected during merge
const MERGEABLE_FIELDS = [
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
] as const;

type MergeableField = (typeof MERGEABLE_FIELDS)[number];

export function MergePreviewDialog({
  wsId,
  keepUser,
  deleteUser,
  open,
  onOpenChange,
  onMergeComplete,
}: Props) {
  const t = useTranslations('ws-users');
  const tc = useTranslations('common');
  const [fieldStrategy, setFieldStrategy] = useState<FieldStrategy>({});
  const [balanceStrategy, setBalanceStrategy] =
    useState<BalanceStrategy>('keep');
  const [confirmed, setConfirmed] = useState(false);

  const {
    data: preview,
    isLoading: isLoadingPreview,
    error: previewError,
  } = useWorkspaceUserMergePreview(wsId, keepUser.id, deleteUser.id, {
    enabled: open,
  });

  const mergeMutation = useMergeWorkspaceUsers(wsId);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFieldStrategy({});
      setBalanceStrategy('keep');
      setConfirmed(false);
    }
  }, [open]);

  const handleMerge = async () => {
    if (!confirmed) {
      toast.error(t('duplicates.merge_confirm_required'));
      return;
    }

    try {
      await mergeMutation.mutateAsync({
        keepUserId: keepUser.id,
        deleteUserId: deleteUser.id,
        fieldStrategy,
        balanceStrategy,
      });

      toast.success(t('duplicates.merge_success'));
      onMergeComplete();
    } catch (error) {
      console.error('Merge error:', error);
      toast.error(
        error instanceof Error ? error.message : t('duplicates.merge_error')
      );
    }
  };

  const getFieldValue = (
    user: WorkspaceUser,
    field: MergeableField
  ): string => {
    const value = user[field as keyof WorkspaceUser];
    if (value === null || value === undefined) return '-';
    return String(value);
  };

  const getSelectedValue = (field: MergeableField): 'keep' | 'delete' => {
    return fieldStrategy[field] || 'keep';
  };

  const handleFieldChange = (
    field: MergeableField,
    value: 'keep' | 'delete'
  ) => {
    setFieldStrategy((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            {t('duplicates.merge_preview_title')}
          </DialogTitle>
          <DialogDescription>
            {t('duplicates.merge_preview_description')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingPreview ? (
          <div className="flex h-75 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : previewError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{tc('error')}</AlertTitle>
            <AlertDescription>
              {previewError instanceof Error
                ? previewError.message
                : t('duplicates.preview_error')}
            </AlertDescription>
          </Alert>
        ) : preview ? (
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* User Comparison Header */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-dynamic-green bg-dynamic-green/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Check className="h-4 w-4 text-dynamic-green" />
                    <span className="font-medium text-dynamic-green">
                      {t('duplicates.user_to_keep')}
                    </span>
                  </div>
                  <UserSummary user={preview.keepUser} />
                </div>
                <div className="rounded-lg border border-dynamic-red bg-dynamic-red/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <X className="h-4 w-4 text-dynamic-red" />
                    <span className="font-medium text-dynamic-red">
                      {t('duplicates.user_to_delete')}
                    </span>
                  </div>
                  <UserSummary user={preview.deleteUser} />
                </div>
              </div>

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <Alert className="border-dynamic-yellow bg-dynamic-yellow/10 [&>svg]:text-dynamic-yellow">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t('duplicates.warnings')}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {preview.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Field Selection */}
              <div className="space-y-4">
                <h4 className="font-medium">{t('duplicates.select_values')}</h4>
                <div className="rounded-lg border">
                  <div className="grid grid-cols-[1fr,1fr,1fr] gap-2 border-b bg-muted/50 p-3 font-medium text-sm">
                    <span>{t('duplicates.field')}</span>
                    <span className="text-center text-dynamic-green">
                      {t('duplicates.keep_user')}
                    </span>
                    <span className="text-center text-dynamic-red">
                      {t('duplicates.delete_user')}
                    </span>
                  </div>
                  {MERGEABLE_FIELDS.map((field) => {
                    const keepValue = getFieldValue(preview.keepUser, field);
                    const deleteValue = getFieldValue(
                      preview.deleteUser,
                      field
                    );
                    const selected = getSelectedValue(field);

                    // Only show if at least one has a value
                    if (keepValue === '-' && deleteValue === '-') return null;

                    return (
                      <div
                        key={field}
                        className="grid grid-cols-[1fr,1fr,1fr] items-center gap-2 border-b p-3 last:border-0"
                      >
                        <span className="font-medium text-sm capitalize">
                          {t(`duplicates.fields.${field}`)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleFieldChange(field, 'keep')}
                          className={cn(
                            'rounded-md p-2 text-center text-sm transition-colors',
                            selected === 'keep'
                              ? 'bg-dynamic-green/20 ring-2 ring-dynamic-green'
                              : 'hover:bg-muted'
                          )}
                        >
                          {keepValue}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFieldChange(field, 'delete')}
                          className={cn(
                            'rounded-md p-2 text-center text-sm transition-colors',
                            selected === 'delete'
                              ? 'bg-dynamic-red/20 ring-2 ring-dynamic-red'
                              : 'hover:bg-muted'
                          )}
                        >
                          {deleteValue}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Balance Strategy */}
              <div className="space-y-4">
                <h4 className="font-medium">
                  {t('duplicates.balance_strategy')}
                </h4>
                <div className="rounded-lg border p-4">
                  <div className="mb-4 flex items-center justify-between text-sm">
                    <span>
                      {t('duplicates.keep_balance')}:{' '}
                      {preview.keepUser.balance ?? 0}
                    </span>
                    <span>
                      {t('duplicates.delete_balance')}:{' '}
                      {preview.deleteUser.balance ?? 0}
                    </span>
                  </div>
                  <RadioGroup
                    value={balanceStrategy}
                    onValueChange={(v) =>
                      setBalanceStrategy(v as BalanceStrategy)
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="keep" id="balance-keep" />
                      <Label htmlFor="balance-keep">
                        {t('duplicates.balance_keep')} (
                        {preview.keepUser.balance ?? 0})
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="add" id="balance-add" />
                      <Label htmlFor="balance-add">
                        {t('duplicates.balance_add')} (
                        {(preview.keepUser.balance ?? 0) +
                          (preview.deleteUser.balance ?? 0)}
                        )
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Affected Records */}
              <Accordion type="single" collapsible>
                <AccordionItem value="affected">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {t('duplicates.affected_records')}
                      <Badge variant="secondary">
                        {preview.totalAffectedRecords}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(preview.affectedRecords).map(
                        ([table, columns]) => {
                          const total = Object.values(columns).reduce(
                            (sum, count) => sum + (count as number),
                            0
                          );
                          if (total === 0) return null;
                          return (
                            <div
                              key={table}
                              className="flex items-center justify-between rounded-md bg-muted p-2"
                            >
                              <span className="font-mono text-xs">{table}</span>
                              <Badge variant="outline">{total}</Badge>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Confirmation */}
              <Separator />
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="confirm"
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                <Label htmlFor="confirm" className="text-sm">
                  {t('duplicates.confirm_merge')}
                </Label>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleMerge}
            disabled={
              !confirmed ||
              isLoadingPreview ||
              !!previewError ||
              mergeMutation.isPending
            }
            className="gap-2"
          >
            {mergeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}
            {t('duplicates.execute_merge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserSummary({ user }: { user: WorkspaceUser }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {user.avatar_url ? (
          <Image
            src={user.avatar_url}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
            width={48}
            height={48}
          />
        ) : (
          <Users className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div>
        <p className="font-medium">
          {user.full_name || user.display_name || 'Unnamed'}
        </p>
        <p className="text-muted-foreground text-sm">{user.email || '-'}</p>
        {user.created_at && (
          <p className="text-muted-foreground text-xs">
            Created: {new Date(user.created_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
