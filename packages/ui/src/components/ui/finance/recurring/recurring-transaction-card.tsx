'use client';

import { Ellipsis } from '@tuturuuu/icons';
import type { RecurringTransactionRecord } from '@tuturuuu/internal-api/finance';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { format } from 'date-fns';
import type { useTranslations } from 'next-intl';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

interface RecurringTransactionCardProps {
  currency: string;
  deletingId: string | null;
  locale: string;
  onDelete: (id: string) => void;
  onEdit: (transaction: RecurringTransactionRecord) => void;
  t: ReturnType<typeof useTranslations>;
  transaction: RecurringTransactionRecord;
}

export function RecurringTransactionCard({
  currency,
  deletingId,
  locale,
  onDelete,
  onEdit,
  t,
  transaction,
}: RecurringTransactionCardProps) {
  const amount = Number(transaction.amount);
  const isDeleting = deletingId === transaction.id;
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="truncate font-medium">{transaction.name}</h4>
            {transaction.description && (
              <p className="line-clamp-2 text-muted-foreground text-sm">
                {transaction.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                {t(transaction.frequency)}
              </span>
              <span className="text-muted-foreground">
                {t('next_occurrence', {
                  date: format(
                    new Date(transaction.next_occurrence),
                    'MMM dd, yyyy'
                  ),
                })}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-start gap-2">
            <p
              className={`font-semibold ${
                areNumbersHidden
                  ? 'text-muted-foreground'
                  : amount >= 0
                    ? 'text-dynamic-green'
                    : 'text-dynamic-red'
              }`}
            >
              {areNumbersHidden
                ? FINANCE_HIDDEN_AMOUNT
                : new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency,
                    signDisplay: 'always',
                  }).format(amount)}
            </p>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 data-[state=open]:bg-muted"
                >
                  <Ellipsis className="h-4 w-4" />
                  <span className="sr-only">{t('open_menu')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEdit(transaction)}>
                  {t('edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      disabled={isDeleting}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {t('delete')}
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('delete_title')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('delete_description', {
                          name: transaction.name,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isDeleting}
                        onClick={() => onDelete(transaction.id)}
                      >
                        {isDeleting ? t('deleting') : t('delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
