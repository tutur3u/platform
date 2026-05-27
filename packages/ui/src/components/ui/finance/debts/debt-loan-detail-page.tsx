'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, MoreHorizontal, Trash, User } from '@tuturuuu/icons';
import {
  deleteDebtLoan,
  getDebtLoan,
  listWallets,
  updateDebtLoan,
} from '@tuturuuu/internal-api/finance';
import type {
  DebtLoanStatus,
  DebtLoanWithBalance,
} from '@tuturuuu/types/primitives/DebtLoan';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
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
import { Skeleton } from '../../skeleton';
import { toast } from '../../sonner';
import { useFinanceHref } from '../finance-route-context';
import {
  DebtLoanDetailsCard,
  DebtLoanPaymentOverviewCard,
} from './debt-loan-detail-cards';
import { DebtLoanForm } from './debt-loan-form';
import { invalidateDebtLoanMutationQueries } from './query-invalidation';

interface Props {
  wsId: string;
  debtId: string;
}

export function DebtLoanDetailPage({ wsId, debtId }: Props) {
  const t = useTranslations('ws-debt-loan');
  const router = useRouter();
  const queryClient = useQueryClient();
  const financeHref = useFinanceHref();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const {
    data: debtLoan,
    isLoading,
    error,
  } = useQuery<DebtLoanWithBalance>({
    queryKey: ['debt-loan', wsId, debtId],
    queryFn: () => getDebtLoan(wsId, debtId),
  });

  const { data: wallets = [] } = useQuery<WalletType[]>({
    queryKey: ['wallets', wsId],
    queryFn: () => listWallets(wsId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDebtLoan(wsId, debtId),
    onSuccess: () => {
      toast.success(t('delete_success'));
      void invalidateDebtLoanMutationQueries(queryClient, wsId, debtId);
      router.push(`/${wsId}${financeHref('/debts')}`);
    },
    onError: () => {
      toast.error(t('delete_error'));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: DebtLoanStatus) =>
      updateDebtLoan(wsId, debtId, { status }),
    onSuccess: async () => {
      toast.success(t('status_update_success'));
      await invalidateDebtLoanMutationQueries(queryClient, wsId, debtId);
    },
    onError: () => {
      toast.error(t('status_update_error'));
    },
  });

  const handleFormFinish = () => {
    setIsEditDialogOpen(false);
    void invalidateDebtLoanMutationQueries(queryClient, wsId, debtId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue';
      case 'paid':
        return 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green';
      case 'defaulted':
        return 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red';
      case 'cancelled':
        return 'border-dynamic-gray/20 bg-dynamic-gray/10 text-dynamic-gray';
      default:
        return 'border-dynamic-gray/20 bg-dynamic-gray/10 text-dynamic-gray';
    }
  };

  const getTypeColor = (type: string) => {
    return type === 'debt'
      ? 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red'
      : 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green';
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
          <Link href={`/${wsId}${financeHref('/debts')}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back_to_list')}
          </Link>
        </Button>
      </div>
    );
  }

  const isOverdue =
    debtLoan.status === 'active' &&
    !!debtLoan.due_date &&
    new Date(debtLoan.due_date) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/${wsId}${financeHref('/debts')}`}>
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
              {isOverdue && <Badge variant="destructive">{t('overdue')}</Badge>}
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
        <DebtLoanPaymentOverviewCard debtLoan={debtLoan} />
        <DebtLoanDetailsCard
          debtLoan={debtLoan}
          isOverdue={isOverdue}
          wallets={wallets}
        />
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-150">
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
