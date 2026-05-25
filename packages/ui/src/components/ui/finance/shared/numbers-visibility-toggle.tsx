'use client';

import { Eye, EyeOff } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Button } from '../../button';
import { useFinanceConfidentialVisibility } from './use-finance-confidential-visibility';

interface FinanceNumbersVisibilityToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function FinanceNumbersVisibilityToggle({
  className,
  showLabel = true,
}: FinanceNumbersVisibilityToggleProps) {
  const t = useTranslations('transaction-data-table');
  const { isConfidential, toggleConfidential } =
    useFinanceConfidentialVisibility();
  const label = isConfidential
    ? t('show_confidential')
    : t('hide_confidential');

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleConfidential}
      aria-label={label}
      title={label}
      className={cn('gap-2', className)}
    >
      {isConfidential ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
      {showLabel && <span className="hidden sm:inline">{label}</span>}
    </Button>
  );
}
