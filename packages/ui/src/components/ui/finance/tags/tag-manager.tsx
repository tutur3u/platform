'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from '@tuturuuu/icons';
import {
  createTransactionTag,
  deleteTransactionTag,
  listTransactionTags,
  type TransactionTagRecord,
  updateTransactionTag,
} from '@tuturuuu/internal-api/finance';
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
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn, formatCurrency } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useFinanceHref } from '../finance-route-context';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

interface TagManagerProps {
  currency: string;
  onOpenCreateDialogChange?: (open: boolean) => void;
  openCreateDialog?: boolean;
  wsId: string;
}

type TransactionTag = TransactionTagRecord;

const tagFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format'),
  description: z.string().optional(),
});

type TagFormValues = z.infer<typeof tagFormSchema>;

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export function TagManager({
  currency,
  onOpenCreateDialogChange,
  openCreateDialog,
  wsId,
}: TagManagerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TransactionTag | null>(null);
  const [tagToDelete, setTagToDelete] = useState<TransactionTag | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  const router = useRouter();
  const financeHref = useFinanceHref();
  const invalidateTagQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['transaction_tags', wsId] });
    queryClient.invalidateQueries({ queryKey: ['transaction-tags', wsId] });
    queryClient.invalidateQueries({
      queryKey: ['transaction_tag_stats', wsId],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/workspaces/${wsId}/tags`],
    });
  };

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale),
    [locale]
  );
  const formatCount = (count: number) =>
    areNumbersHidden ? FINANCE_HIDDEN_AMOUNT : numberFormatter.format(count);
  const formatTagAmount = (amount: number) =>
    areNumbersHidden
      ? FINANCE_HIDDEN_AMOUNT
      : formatCurrency(amount, currency, locale, {
          signDisplay: 'always',
        });
  const formatCountLabel = (count: number) =>
    areNumbersHidden
      ? FINANCE_HIDDEN_AMOUNT
      : t('ws-transaction-tags.transaction_count_short', { count });
  const formatRecentPace = (count: number) =>
    areNumbersHidden
      ? FINANCE_HIDDEN_AMOUNT
      : t('ws-transaction-tags.recent_pace_value', { count });

  const { data: tags, isLoading } = useQuery({
    queryKey: ['transaction_tags', wsId],
    queryFn: () => listTransactionTags(wsId),
  });

  const filteredTags = useMemo(() => {
    if (!tags) return [];
    if (!searchQuery.trim()) return tags;
    const query = searchQuery.toLowerCase();
    return tags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(query) ||
        tag.description?.toLowerCase().includes(query)
    );
  }, [tags, searchQuery]);

  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: {
      name: '',
      color: PRESET_COLORS[0],
      description: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: TagFormValues) =>
      createTransactionTag(wsId, {
        name: data.name,
        color: data.color,
        description: data.description || null,
      }),
    onSuccess: () => {
      toast.success(t('ws-transaction-tags.create_success'));
      invalidateTagQueries();
      form.reset();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-transaction-tags.create_error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TagFormValues }) =>
      updateTransactionTag(wsId, id, {
        name: data.name,
        color: data.color,
        description: data.description || null,
      }),
    onSuccess: () => {
      toast.success(t('ws-transaction-tags.update_success'));
      invalidateTagQueries();
      setEditingTag(null);
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-transaction-tags.update_error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tagId: string) => deleteTransactionTag(wsId, tagId),
    onSuccess: () => {
      toast.success(t('ws-transaction-tags.delete_success'));
      invalidateTagQueries();
      setTagToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-transaction-tags.delete_error'));
    },
  });

  const handleTagClick = (tagId: string) => {
    router.push(`/${wsId}${financeHref('/transactions')}?tagIds=${tagId}`);
  };

  const handleOpenCreate = useCallback(() => {
    setEditingTag(null);
    form.reset({
      name: '',
      color: PRESET_COLORS[0],
      description: '',
    });
    setIsDialogOpen(true);
  }, [form]);

  useEffect(() => {
    if (openCreateDialog) handleOpenCreate();
  }, [handleOpenCreate, openCreateDialog]);

  const handleOpenEdit = (tag: TransactionTag) => {
    setEditingTag(tag);
    form.reset({
      name: tag.name,
      color: tag.color,
      description: tag.description || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: TagFormValues) => {
    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div className="w-full">
          <h1 className="w-full font-bold text-2xl">
            {t('ws-transaction-tags.plural')}
          </h1>
          <div className="whitespace-pre-wrap text-foreground/80">
            {t('ws-transaction-tags.description')}
          </div>
        </div>
        <Button
          size="xs"
          className="w-full md:w-fit"
          onClick={handleOpenCreate}
        >
          <Plus className="mr-1 h-5 w-5" />
          {t('ws-transaction-tags.create')}
        </Button>
      </div>

      <Separator />

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('ws-transaction-tags.search_placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tags Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                </div>
                <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-20 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTags.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTags.map((tag) => {
            const transactionCount = Number(tag.transaction_count ?? 0);
            const incomeCount = Number(tag.income_count ?? 0);
            const expenseCount = Number(tag.expense_count ?? 0);
            const totalIncome = Number(tag.total_income ?? 0);
            const totalExpense = Number(tag.total_expense ?? 0);
            const recentTransactionCount = Number(
              tag.recent_transaction_count ?? 0
            );
            return (
              <Card
                key={tag.id}
                className="group relative cursor-pointer overflow-hidden transition-all hover:shadow-md"
                onClick={() => handleTagClick(tag.id)}
              >
                {/* Color accent bar */}
                <div
                  className="absolute top-0 right-0 left-0 h-1"
                  style={{ backgroundColor: tag.color }}
                />
                <CardContent className="p-4 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <Badge
                        variant="outline"
                        className="text-sm"
                        style={{
                          borderColor: tag.color,
                          color: tag.color,
                          backgroundColor: `${tag.color}15`,
                        }}
                      >
                        <Tag className="mr-1 h-3 w-3" />
                        {tag.name}
                      </Badge>
                      {tag.description && (
                        <p className="line-clamp-2 text-muted-foreground text-sm">
                          {tag.description}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTagClick(tag.id);
                          }}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t('ws-transaction-tags.view_transactions')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(tag);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-dynamic-red focus:text-dynamic-red"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTagToDelete(tag);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {areNumbersHidden
                        ? t('ws-transaction-tags.transactions_hidden')
                        : t('ws-transaction-tags.transaction_count', {
                            count: transactionCount,
                          })}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 font-medium text-xs"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                      }}
                    >
                      {formatCount(transactionCount)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-dynamic-green/20 bg-dynamic-green/5 p-2">
                      <div className="flex items-center gap-1 text-dynamic-green text-xs">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        {t('ws-transaction-tags.income')}
                      </div>
                      <div className="mt-1 break-words font-semibold text-dynamic-green text-sm">
                        {formatTagAmount(totalIncome)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatCountLabel(incomeCount)}
                      </div>
                    </div>
                    <div className="rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-2">
                      <div className="flex items-center gap-1 text-dynamic-red text-xs">
                        <ArrowDownRight className="h-3.5 w-3.5" />
                        {t('ws-transaction-tags.expense')}
                      </div>
                      <div className="mt-1 break-words font-semibold text-dynamic-red text-sm">
                        {formatTagAmount(-totalExpense)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatCountLabel(expenseCount)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Activity className="h-3.5 w-3.5" />
                      {t('ws-transaction-tags.recent_pace')}
                    </span>
                    <span className="font-medium">
                      {formatRecentPace(recentTransactionCount)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Tag className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 font-semibold text-lg">
              {searchQuery
                ? t('common.no-results')
                : t('ws-transaction-tags.empty_title')}
            </h3>
            <p className="mb-4 max-w-sm text-center text-muted-foreground text-sm">
              {searchQuery
                ? t('ws-transaction-tags.search_empty')
                : t('ws-transaction-tags.empty_description')}
            </p>
            {!searchQuery && (
              <Button onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" />
                {t('ws-transaction-tags.create')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open && openCreateDialog) {
            onOpenCreateDialogChange?.(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTag
                ? t('ws-transaction-tags.edit')
                : t('ws-transaction-tags.create')}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ws-transaction-tags.name')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('ws-transaction-tags.name_placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('ws-transaction-tags.description_label')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t(
                          'ws-transaction-tags.description_placeholder'
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ws-transaction-tags.color')}</FormLabel>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={cn(
                              'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                              field.value === color
                                ? 'border-foreground ring-2 ring-offset-2'
                                : 'border-transparent'
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => field.onChange(color)}
                          />
                        ))}
                      </div>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-8 w-8 rounded-full border"
                            style={{ backgroundColor: field.value }}
                          />
                          <Input
                            type="color"
                            {...field}
                            className="h-8 w-20 cursor-pointer p-0"
                          />
                          <Input
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="#000000"
                            className="w-24 font-mono text-sm"
                          />
                        </div>
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : editingTag ? (
                  t('common.save')
                ) : (
                  t('ws-transaction-tags.create')
                )}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!tagToDelete}
        onOpenChange={(open) => !open && setTagToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-transaction-tags.delete_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('ws-transaction-tags.delete_confirm_description')}
              {tagToDelete && (
                <span className="mt-2 block">
                  <Badge
                    variant="outline"
                    style={{
                      borderColor: tagToDelete.color,
                      color: tagToDelete.color,
                      backgroundColor: `${tagToDelete.color}15`,
                    }}
                  >
                    <Tag className="mr-1 h-3 w-3" />
                    {tagToDelete.name}
                  </Badge>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                tagToDelete && deleteMutation.mutate(tagToDelete.id)
              }
              disabled={deleteMutation.isPending}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.deleting')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
