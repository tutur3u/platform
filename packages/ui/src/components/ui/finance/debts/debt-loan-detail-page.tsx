'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit,
  MoreHorizontal,
  Percent,
  Trash,
  User,
  Wallet,
} from '@tuturuuu/icons';
import type { DebtLoanWithBalance } from '@tuturuuu/types/primitives/DebtLoan';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import { cn, formatCurrency } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../alert-dialog';
import { Badge } from '../../badge';
import { Button } from '../../button';
import { Card, CardContent, CardHeader, CardTitle } from '../../card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../dropdown-menu';
import { Progress } from '../../progress';
import { Separator } from '../../separator';
import { Skeleton } from '../../skeleton';
import { toast } from '../../sonner';
import { DebtLoanForm } from './debt-loan-form';

interface Props {
  wsId: string;
  debtId: string;
}

export function DebtLoanDetailPage({ wsId, debtId }: Props) {
  const t = useTranslations('ws-debt-loan');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch debt/loan details
  const {
    data: debtLoan,
    isLoading,
    error,
  } = useQuery<DebtLoanWithBalance>({
    queryKey: ['debt-loan', wsId, debtId],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/finance/debts/${debtId}`
      );
      if (!res.ok) {
        if (res.status === 404) throw new Error('Not found');
        throw new Error('Failed to fetch');
      }
      return res.json();
    },
  });

  // Fetch wallets for the edit form
  const { data: wallets = [] } = useQuery<WalletType[]>({
    queryKey: ['wallets', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/workspaces/${wsId}/wallets`);
      if (!res.ok) throw new Error('Failed to fetch wallets');
      return res.json();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/finance/debts/${debtId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('delete_success'));
      router.push(`/${wsId}/finance/debts`);
    },
    onError: () => {
      toast.error(t('delete_error'));
    },
  });

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/finance/debts/${debtId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('status_update_success'));
      queryClient.invalidateQueries({ queryKey: ['debt-loan', wsId, debtId] });
      queryClient.invalidateQueries({ queryKey: ['debt-loan-summary', wsId] });
    },
    onError: () => {
      toast.error(t('status_update_error'));
    },
  });

  const handleFormFinish = () => {
    setIsEditDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['debt-loan', wsId, debtId] });
    queryClient.invalidateQueries({ queryKey: ['debt-loan-summary', wsId] });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400';
      case 'paid':
        return 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400';
      case 'defaulted':
        return 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400';
      case 'cancelled':
        return 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-200';
    }
  };

  const getTypeColor = (type: string) => {
    return type === 'debt'
      ? 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400'
      : 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !debtLoan) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="mb-2 font-semibold text-lg">{t('not_found')}</h2>
        <p className="mb-4 text-muted-foreground">
          {t('not_found_description')}
        </p>
        <Button asChild>
          <Link href={`/${wsId}/finance/debts`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back_to_list')}
          </Link>
        </Button>
      </div>
    );
  }

  const isOverdue =
    debtLoan.status === 'active' &&
    debtLoan.due_date &&
    new Date(debtLoan.due_date) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/${wsId}/finance/debts`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-bold text-2xl tracking-tight">
                {debtLoan.name}
              </h1>
              <Badge variant="outline" className={getTypeColor(debtLoan.type)}>
                {t(debtLoan.type)}
              </Badge>
              <Badge
                variant="outline"
                className={getStatusColor(debtLoan.status)}
              >
                {t(debtLoan.status)}
              </Badge>
              {isOverdue && (
                <Badge variant="destructive" className="bg-red-500 text-white">
                  {t('overdue')}
                </Badge>
              )}
            </div>
            {debtLoan.counterparty && (
              <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                <User className="h-4 w-4" />
                {debtLoan.counterparty}
              </p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {debtLoan.status === 'active' && (
              <>
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate('paid')}
                >
                  {t('mark_as_paid')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate('cancelled')}
                >
                  {t('mark_as_cancelled')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {debtLoan.status !== 'active' && (
              <>
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate('active')}
                >
                  {t('reopen')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash className="mr-2 h-4 w-4" />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Amount overview */}
        <Card>
          <CardHeader>
            <CardTitle>{t('payment_overview')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('principal_amount')}
                </span>
                <span className="font-semibold text-lg">
                  {formatCurrency(debtLoan.principal_amount, debtLoan.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('amount_paid')}
                </span>
                <span className="font-semibold text-green-600 text-lg dark:text-green-400">
                  {formatCurrency(debtLoan.total_paid, debtLoan.currency)}
                </span>
              </div>
              {debtLoan.total_interest_paid > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('interest_paid')}
                  </span>
                  <span className="text-muted-foreground">
                    {formatCurrency(
                      debtLoan.total_interest_paid,
                      debtLoan.currency
                    )}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-medium">{t('remaining')}</span>
                <span
                  className={cn(
                    'font-bold text-xl',
                    debtLoan.remaining_balance === 0
                      ? 'text-green-600 dark:text-green-400'
                      : debtLoan.type === 'debt'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-blue-600 dark:text-blue-400'
                  )}
                >
                  {formatCurrency(
                    debtLoan.remaining_balance,
                    debtLoan.currency
                  )}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <Progress value={debtLoan.progress_percentage} className="h-3" />
              <p className="text-center text-muted-foreground text-sm">
                {debtLoan.progress_percentage.toFixed(1)}% {t('completed')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle>{t('details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t('start_date')}:
                </span>
                <span className="font-medium">
                  {new Date(debtLoan.start_date).toLocaleDateString()}
                </span>
              </div>

              {debtLoan.due_date && (
                <div
                  className={cn(
                    'flex items-center gap-2',
                    isOverdue && 'text-red-600 dark:text-red-400'
                  )}
                >
                  <Clock className="h-4 w-4" />
                  <span className={cn(!isOverdue && 'text-muted-foreground')}>
                    {t('due_date')}:
                  </span>
                  <span className="font-medium">
                    {new Date(debtLoan.due_date).toLocaleDateString()}
                    {isOverdue && ` (${t('overdue')})`}
                  </span>
                </div>
              )}

              {debtLoan.interest_rate !== null &&
                debtLoan.interest_rate !== undefined && (
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {t('interest_rate')}:
                    </span>
                    <span className="font-medium">
                      {debtLoan.interest_rate}%/{t('year')}
                      {debtLoan.interest_type &&
                        ` (${t(debtLoan.interest_type)})`}
                    </span>
                  </div>
                )}

              {debtLoan.wallet_id && (
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {t('associated_wallet')}:
                  </span>
                  <span className="font-medium">
                    {wallets.find((w) => w.id === debtLoan.wallet_id)?.name ||
                      t('unknown_wallet')}
                  </span>
                </div>
              )}
            </div>

            {debtLoan.description && (
              <>
                <Separator />
                <div>
                  <p className="mb-1 font-medium text-sm">{t('description')}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                    {debtLoan.description}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('edit_entry')}</DialogTitle>
            <DialogDescription>{t('edit_entry_description')}</DialogDescription>
          </DialogHeader>
          <DebtLoanForm
            wsId={wsId}
            data={debtLoan}
            wallets={wallets}
            onFinish={handleFormFinish}
            onCancel={() => setIsEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('delete_confirmation_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_confirmation_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
