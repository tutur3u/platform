'use client';

import {
  CreditCard,
  DollarSign,
  FileText,
  Plus,
  Target,
  Wallet,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

interface QuickActionsProps {
  wsId: string;
}

export function QuickActions({ wsId }: QuickActionsProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="lg"
          className="fixed right-6 bottom-6 z-50 h-14 w-14 rounded-full p-0 shadow-lg"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Quick Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push(`/${wsId}/finance/transactions/new`)}
        >
          <DollarSign className="mr-2 h-4 w-4" />
          <span>New Transaction</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push(`/${wsId}/finance/wallets/new`)}
        >
          <Wallet className="mr-2 h-4 w-4" />
          <span>New Wallet</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push(`/${wsId}/finance/budgets`)}
        >
          <Target className="mr-2 h-4 w-4" />
          <span>New Budget</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push(`/${wsId}/finance/invoices/new`)}
        >
          <FileText className="mr-2 h-4 w-4" />
          <span>New Invoice</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            router.push(`/${wsId}/finance/transactions/categories`)
          }
        >
          <CreditCard className="mr-2 h-4 w-4" />
          <span>Manage Categories</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
