'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Check,
  DollarSign,
  FileText,
  FolderOpen,
  Loader2,
  Tag,
  Trash,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
  X,
} from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { fetcher } from '@tuturuuu/utils/fetcher';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface TransactionEditDialogProps {
  transaction: Transaction & {
    workspace_users?: {
      full_name: string;
      email: string;
      avatar_url: string | null;
    } | null;
  };
  wsId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  canUpdateTransactions?: boolean;
  canDeleteTransactions?: boolean;
}

export function TransactionEditDialog({
  transaction,
  wsId,
  isOpen,
  onClose,
  onUpdate,
  canUpdateTransactions,
  canDeleteTransactions,
}: TransactionEditDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Form state
  const initialAmount = transaction?.amount
    ? Math.abs(transaction.amount).toString()
    : '';
  const [description, setDescription] = useState(
    transaction?.description || ''
  );
  const [amount, setAmount] = useState(initialAmount);
  const [displayAmount, setDisplayAmount] = useState(
    initialAmount
      ? Intl.NumberFormat(locale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(parseFloat(initialAmount))
      : ''
  );
  const [walletId, setWalletId] = useState(transaction?.wallet_id || '');
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '');
  const [takenAt, setTakenAt] = useState<Date | undefined>(
    transaction?.taken_at ? new Date(transaction.taken_at) : new Date()
  );
  const [reportOptIn, setReportOptIn] = useState(
    transaction?.report_opt_in ?? true
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch categories
  const { data: categoriesData } = useQuery<TransactionCategory[]>({
    queryKey: [`/api/workspaces/${wsId}/transactions/categories`],
    queryFn: () => fetcher(`/api/workspaces/${wsId}/transactions/categories`),
    enabled: isOpen,
  });
  const categories = Array.isArray(categoriesData) ? categoriesData : [];

  // Fetch wallets
  const { data: walletsData } = useQuery<Wallet[]>({
    queryKey: [`/api/workspaces/${wsId}/wallets`],
    queryFn: () => fetcher(`/api/workspaces/${wsId}/wallets`),
    enabled: isOpen,
  });
  const wallets = Array.isArray(walletsData) ? walletsData : [];

  // Fetch tags
  const { data: tagsData } = useQuery<
    Array<{ id: string; name: string; color: string }>
  >({
    queryKey: [`/api/workspaces/${wsId}/tags`],
    queryFn: () => fetcher(`/api/workspaces/${wsId}/tags`),
    enabled: isOpen,
  });
  const tags = Array.isArray(tagsData) ? tagsData : [];

  // Fetch existing tags for this transaction
  const { data: existingTagsData } = useQuery<Array<{ tag_id: string }>>({
    queryKey: [`/api/workspaces/${wsId}/transactions/${transaction?.id}/tags`],
    queryFn: () =>
      fetcher(`/api/workspaces/${wsId}/transactions/${transaction?.id}/tags`),
    enabled: isOpen && !!transaction?.id,
  });
  const existingTags = Array.isArray(existingTagsData) ? existingTagsData : [];

  // Update selected tags when data loads
  useEffect(() => {
    if (existingTags.length > 0) {
      setSelectedTagIds(existingTags.map((t) => t.tag_id));
    }
  }, [existingTags]);

  // Format amount for display
  const formatAmountForDisplay = useCallback(
    (value: string) => {
      if (!value) return '';
      const numValue = parseFloat(value);
      if (Number.isNaN(numValue)) return '';
      return Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(numValue);
    },
    [locale]
  );

  // Reset form when dialog opens or transaction changes
  useEffect(() => {
    if (isOpen && transaction) {
      const amountValue = transaction.amount
        ? Math.abs(transaction.amount).toString()
        : '';
      setDescription(transaction.description || '');
      setAmount(amountValue);
      setDisplayAmount(formatAmountForDisplay(amountValue));
      setWalletId(transaction.wallet_id || '');
      setCategoryId(transaction.category_id || '');
      setTakenAt(
        transaction.taken_at ? new Date(transaction.taken_at) : new Date()
      );
      setReportOptIn(transaction.report_opt_in ?? true);
    } else if (isOpen && !transaction) {
      // Reset for new transaction
      setDescription('');
      setAmount('');
      setDisplayAmount('');
      setWalletId('');
      setCategoryId('');
      setTakenAt(new Date());
      setReportOptIn(true);
    }
  }, [isOpen, transaction, formatAmountForDisplay]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isExpense = selectedCategory?.is_expense !== false;
  const numericAmount = parseFloat(amount) || 0;

  const canSave =
    numericAmount > 0 &&
    walletId &&
    categoryId &&
    takenAt &&
    canUpdateTransactions;

  // Update display amount when amount changes
  useEffect(() => {
    setDisplayAmount(formatAmountForDisplay(amount));
  }, [amount, formatAmountForDisplay]);

  // Handle amount input change
  const handleAmountChange = (value: string) => {
    // Remove all non-numeric characters except decimal point
    const cleaned = value.replace(/[^\d.]/g, '');

    // Only allow one decimal point
    const parts = cleaned.split('.');
    const formatted =
      parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;

    setAmount(formatted);
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    // Check permissions before making API call
    if (!canUpdateTransactions) {
      toast.error(t('common.insufficient_permissions'));
      return;
    }

    setIsLoading(true);

    try {
      const finalAmount = isExpense
        ? -Math.abs(numericAmount)
        : Math.abs(numericAmount);

      const res = await fetch(
        transaction?.id
          ? `/api/workspaces/${wsId}/transactions/${transaction.id}`
          : `/api/workspaces/${wsId}/transactions`,
        {
          method: transaction?.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: transaction?.id,
            description,
            amount: finalAmount,
            origin_wallet_id: walletId,
            category_id: categoryId,
            taken_at: takenAt?.toISOString(),
            report_opt_in: reportOptIn,
            tag_ids: selectedTagIds,
          }),
        }
      );

      if (res.ok) {
        toast.success(
          transaction?.id
            ? t('ws-transactions.edit')
            : t('ws-transactions.create'),
          {
            description: transaction?.id
              ? 'Transaction updated successfully'
              : 'Transaction created successfully',
          }
        );

        // Invalidate all transaction queries (including infinite scroll)
        await queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            typeof query.queryKey[0] === 'string' &&
            query.queryKey[0].includes(`/api/workspaces/${wsId}/transactions`),
        });

        onUpdate?.();
        router.refresh();
        onClose();
      } else {
        const error = await res.json();
        toast.error(
          error instanceof Error
            ? error.message
            : t('ws-transactions.error_saving_transaction')
        );
      }
    } catch {
      toast.error(t('ws-transactions.error_saving_transaction'));
    } finally {
      setIsLoading(false);
    }
  }, [
    canSave,
    isExpense,
    numericAmount,
    transaction,
    wsId,
    description,
    walletId,
    categoryId,
    takenAt,
    reportOptIn,
    selectedTagIds,
    toast,
    t,
    queryClient,
    onUpdate,
    router,
    onClose,
  ]);

  const handleDelete = async () => {
    if (!transaction.id) return;

    // Check permissions before making API call
    if (!canDeleteTransactions) {
      toast.error(t('common.insufficient_permissions'));
      setShowDeleteConfirm(false);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/workspaces/${wsId}/transactions/${transaction.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('ws-transactions.delete'));

        // Invalidate all transaction queries (including infinite scroll)
        await queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            typeof query.queryKey[0] === 'string' &&
            query.queryKey[0].includes(`/api/workspaces/${wsId}/transactions`),
        });

        onUpdate?.();
        router.refresh();
        onClose();
      } else {
        const error = await res.json();
        toast.error(
          error instanceof Error
            ? error.message
            : t('ws-transactions.error_deleting_transaction')
        );
      }
    } catch {
      toast.error(t('ws-transactions.error_deleting_transaction'));
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to save
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSave && !isLoading) {
          handleSave();
        }
      }

      // Escape to close
      if (e.key === 'Escape' && !showDeleteConfirm) {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canSave, isLoading, showDeleteConfirm, handleSave, handleClose]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose} modal={true}>
        <DialogContent
          showCloseButton={false}
          className="!inset-0 !top-0 !left-0 !max-w-none !translate-x-0 !translate-y-0 !rounded-none data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 flex h-screen max-h-screen w-screen gap-0 border-0 p-0"
        >
          {/* Main content area */}
          <div className="flex min-w-0 flex-1 flex-col bg-background">
            {/* Header with gradient */}
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-dynamic-blue/5 via-background to-background px-4 py-3 backdrop-blur-sm md:px-8 md:py-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg ring-1',
                    isExpense
                      ? 'bg-dynamic-red/10 ring-dynamic-red/20'
                      : 'bg-dynamic-green/10 ring-dynamic-green/20'
                  )}
                >
                  {isExpense ? (
                    <TrendingDown className="h-4 w-4 text-dynamic-red" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-dynamic-green" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <DialogTitle className="truncate font-semibold text-base text-foreground md:text-lg">
                    {canUpdateTransactions
                      ? transaction?.id
                        ? t('ws-transactions.edit')
                        : t('ws-transactions.create')
                      : t('ws-transactions.view')}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {canUpdateTransactions
                      ? transaction?.id
                        ? t('ws-transactions.edit_description')
                        : t('ws-transactions.create_description')
                      : t('ws-transactions.view_description')}
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-1 md:gap-2">
                {transaction?.id && canDeleteTransactions && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-dynamic-red"
                    onClick={() => setShowDeleteConfirm(true)}
                    title="Delete transaction"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={handleClose}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
                {canUpdateTransactions && (
                  <Button
                    variant="secondary"
                    onClick={handleSave}
                    disabled={!canSave || isLoading}
                    size="xs"
                    className="hidden md:inline-flex"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('ws-transactions.saving')}
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        {transaction?.id
                          ? t('ws-transactions.save_changes')
                          : t('ws-transactions.create_transaction')}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Main editing area */}
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 md:p-8">
              {/* Amount Section - Most prominent */}
              <div className="space-y-3 rounded-lg border-2 border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-4 shadow-sm">
                <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-md',
                      isExpense ? 'bg-dynamic-red/15' : 'bg-dynamic-green/15'
                    )}
                  >
                    <DollarSign
                      className={cn(
                        'h-3.5 w-3.5',
                        isExpense ? 'text-dynamic-red' : 'text-dynamic-green'
                      )}
                    />
                  </div>
                  {t('transaction-data-table.amount')}
                </Label>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={displayAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0"
                    disabled={!canUpdateTransactions}
                    className={cn(
                      'pr-16 font-bold text-2xl tabular-nums',
                      isExpense ? 'text-dynamic-red' : 'text-dynamic-green',
                      !canUpdateTransactions && 'cursor-not-allowed opacity-60'
                    )}
                  />
                  <div className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 flex items-center gap-1.5 text-muted-foreground text-sm">
                    <span className="font-medium">VND</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>
                    {isExpense
                      ? t('transaction-data-table.expense')
                      : t('transaction-data-table.income')}
                  </span>
                  <span className="font-medium">
                    {Intl.NumberFormat(locale, {
                      style: 'currency',
                      currency: 'VND',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                      signDisplay: 'always',
                    }).format(isExpense ? -numericAmount : numericAmount)}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-blue/15">
                    <FileText className="h-3.5 w-3.5 text-dynamic-blue" />
                  </div>
                  {t('transaction-data-table.description')}
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add details about this transaction..."
                  disabled={!canUpdateTransactions}
                  className={cn(
                    'min-h-[80px] resize-none',
                    !canUpdateTransactions && 'cursor-not-allowed opacity-60'
                  )}
                />
              </div>

              {/* Wallet */}
              <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-blue/15">
                    <WalletIcon className="h-3.5 w-3.5 text-dynamic-blue" />
                  </div>
                  {t('transaction-data-table.wallet')}
                </Label>
                <Combobox
                  t={t}
                  selected={walletId}
                  onChange={(value) => setWalletId(value as string)}
                  options={wallets
                    .filter((w) => w.id && w.name)
                    .map((w) => ({
                      value: w.id!,
                      label: w.name!,
                    }))}
                  placeholder={t('transaction-data-table.select_wallet')}
                  disabled={!canUpdateTransactions}
                />
              </div>

              {/* Category */}
              <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-blue/15">
                    <FolderOpen className="h-3.5 w-3.5 text-dynamic-blue" />
                  </div>
                  {t('transaction-data-table.category')}
                </Label>
                <Combobox
                  t={t}
                  selected={categoryId}
                  onChange={(value) => setCategoryId(value as string)}
                  options={categories
                    .filter((c) => c.id && c.name)
                    .map((c) => ({
                      value: c.id!,
                      label: c.name!,
                    }))}
                  placeholder={t('transaction-data-table.select_category')}
                  disabled={!canUpdateTransactions}
                />
              </div>

              {/* Date */}
              <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-blue/15">
                    <Calendar className="h-3.5 w-3.5 text-dynamic-blue" />
                  </div>
                  {t('transaction-data-table.taken_at')}
                </Label>
                <DateTimePicker
                  date={takenAt}
                  setDate={setTakenAt}
                  showTimeSelect={true}
                  allowClear={false}
                  showFooterControls={true}
                  disabled={!canUpdateTransactions}
                />
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                  <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-blue/15">
                      <Tag className="h-3.5 w-3.5 text-dynamic-blue" />
                    </div>
                    {t('transaction-data-table.tags')}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className={cn(
                            'transition-all',
                            isSelected && 'ring-2',
                            canUpdateTransactions && 'cursor-pointer',
                            !canUpdateTransactions &&
                              'cursor-not-allowed opacity-60'
                          )}
                          style={{
                            borderColor: tag.color,
                            color: isSelected ? tag.color : undefined,
                            backgroundColor: isSelected
                              ? `${tag.color}20`
                              : undefined,
                            ...(isSelected &&
                              ({
                                '--tw-ring-color': tag.color,
                              } as React.CSSProperties)),
                          }}
                          onClick={
                            canUpdateTransactions
                              ? () => toggleTag(tag.id)
                              : undefined
                          }
                        >
                          {tag.name}
                        </Badge>
                      );
                    })}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('transaction-data-table.tags_description')}
                  </p>
                </div>
              )}

              {/* Report Opt-in */}
              <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="font-semibold text-foreground text-sm">
                      {t('transaction-data-table.report_opt_in')}
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      {t('transaction-data-table.report_opt_in_description')}
                    </p>
                  </div>
                  <Switch
                    checked={reportOptIn}
                    onCheckedChange={setReportOptIn}
                    disabled={!canUpdateTransactions}
                  />
                </div>
              </div>

              {/* Mobile Save Button */}
              {canUpdateTransactions && (
                <div className="md:hidden">
                  <Button
                    onClick={handleSave}
                    disabled={!canSave || isLoading}
                    size="default"
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('ws-transactions.saving')}
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        {transaction?.id
                          ? t('ws-transactions.save_changes')
                          : t('ws-transactions.create_transaction')}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ws-transactions.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ws-transactions.delete_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-dynamic-red hover:bg-dynamic-red/90"
            >
              {t('ws-transactions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
