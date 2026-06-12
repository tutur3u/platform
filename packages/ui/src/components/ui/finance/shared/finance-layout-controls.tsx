'use client';

import { cn } from '@tuturuuu/utils/format';
import { usePathname } from 'next/navigation';
import { FinanceBalanceModeToggle } from './balance-mode-toggle';
import { FinanceNumbersVisibilityToggle } from './numbers-visibility-toggle';

interface FinanceLayoutControlsProps {
  className?: string;
  financePrefix?: string;
}

function normalizePathname(pathname: string | null) {
  if (!pathname) return '';
  return pathname.replace(/\/+$/u, '');
}

function isWalletIndexPath(pathname: string, financePrefix: string) {
  const normalizedPrefix = financePrefix.replace(/\/+$/u, '');
  if (normalizedPrefix) {
    return pathname.endsWith(`${normalizedPrefix}/wallets`);
  }

  return pathname.endsWith('/wallets');
}

export function FinanceLayoutControls({
  className,
  financePrefix = '/finance',
}: FinanceLayoutControlsProps) {
  const pathname = normalizePathname(usePathname());

  if (isWalletIndexPath(pathname, financePrefix)) {
    return null;
  }

  return (
    <div className={cn('mb-4 flex flex-wrap justify-end gap-2', className)}>
      <FinanceBalanceModeToggle />
      <FinanceNumbersVisibilityToggle />
    </div>
  );
}
