'use client';

import { Lock } from '@tuturuuu/icons';
import { formatCurrency } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Checkbox } from '../../checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';

interface ConfidentialFieldProps {
  isConfidential: boolean;
  isRedacted: boolean;
  children: React.ReactNode;
}

/**
 * Wrapper component for displaying potentially confidential fields
 * Shows redaction UI when field is confidential and user lacks permission
 */
export function ConfidentialField({
  isConfidential,
  isRedacted,
  children,
}: ConfidentialFieldProps) {
  const t = useTranslations('workspace-finance-transactions');

  if (!isConfidential || !isRedacted) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 text-dynamic-foreground/40">
          <Lock className="h-3.5 w-3.5" />
          <span className="italic">{t('confidential-field-redacted')}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-sm">{t('confidential-permission-required')}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ConfidentialAmountProps {
  amount: number | null;
  isConfidential: boolean;
  isRedacted?: boolean;
  formatAmount?: (amount: number) => string;
  currency?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Display component for transaction amounts with confidentiality support
 * Shows "•••" with lock icon if redacted
 * Automatically detects redaction when amount is null and isConfidential is true
 */
export function ConfidentialAmount({
  amount,
  isConfidential,
  isRedacted,
  formatAmount,
  currency = 'USD',
  className = '',
  style,
}: ConfidentialAmountProps) {
  const t = useTranslations('workspace-finance-transactions');

  // Auto-detect redaction: amount is null AND field is confidential
  const actuallyRedacted = isRedacted ?? (amount === null && isConfidential);

  // Default formatter using currency (locale is derived from currency via getCurrencyLocale)
  // Use 'exceptZero' to show + for income, - for expense, no sign for zero
  const defaultFormatter = (amt: number) =>
    formatCurrency(amt, currency, undefined, { signDisplay: 'exceptZero' });

  if (actuallyRedacted) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-2 text-dynamic-foreground/40 ${className}`}
          >
            <Lock className="h-4 w-4" />
            <span className="font-mono font-semibold tracking-wider">
              {t('amount-redacted')}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-sm">{t('confidential-permission-required')}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Use provided formatter or default
  const formatter = formatAmount || defaultFormatter;

  return (
    <span className={className} style={style}>
      {amount !== null ? formatter(amount) : '—'}
    </span>
  );
}

interface ConfidentialDescriptionProps {
  description: string | null;
  isConfidential: boolean;
  isRedacted: boolean;
  className?: string;
}

/**
 * Display component for transaction descriptions with confidentiality support
 * Shows "[CONFIDENTIAL]" with lock icon if redacted
 */
export function ConfidentialDescription({
  description,
  isConfidential,
  isRedacted,
  className = '',
}: ConfidentialDescriptionProps) {
  const t = useTranslations('workspace-finance-transactions');

  if (isConfidential && isRedacted) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-2 text-dynamic-foreground/40 ${className}`}
          >
            <Lock className="h-4 w-4" />
            <span className="italic">{t('description-redacted')}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-sm">{t('confidential-permission-required')}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return <span className={className}>{description || '—'}</span>;
}

interface ConfidentialCategoryProps {
  category: {
    id: string;
    name: string;
  } | null;
  isConfidential: boolean;
  isRedacted: boolean;
  renderCategory?: (category: { id: string; name: string }) => React.ReactNode;
  className?: string;
}

/**
 * Display component for transaction categories with confidentiality support
 * Shows lock icon placeholder if redacted, otherwise shows category badge
 */
export function ConfidentialCategory({
  category,
  isConfidential,
  isRedacted,
  renderCategory,
  className = '',
}: ConfidentialCategoryProps) {
  const t = useTranslations('workspace-finance-transactions');

  if (isConfidential && isRedacted) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-2 rounded-md bg-dynamic-surface/80 px-2 py-1 text-dynamic-foreground/40 text-sm ${className}`}
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="text-xs italic">{t('category-redacted')}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-sm">{t('confidential-permission-required')}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!category) {
    return <span className={className}>—</span>;
  }

  if (renderCategory) {
    return <>{renderCategory(category)}</>;
  }

  return <span className={className}>{category.name}</span>;
}

interface ConfidentialToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Toggle switch component for marking fields as confidential
 * Shows disabled state with tooltip when user lacks permission
 */
export function ConfidentialToggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  icon: Icon,
}: ConfidentialToggleProps) {
  const t = useTranslations('workspace-finance-transactions');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label
          className={`flex items-start gap-3 rounded-lg border border-dynamic-border p-4 transition-colors ${
            disabled
              ? 'cursor-not-allowed bg-dynamic-surface/40 opacity-60'
              : 'cursor-pointer hover:bg-dynamic-surface/60'
          }`}
        >
          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-surface">
              <Icon className="h-5 w-5 text-dynamic-foreground/70" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-dynamic-foreground">
                  {label}
                </span>
                {checked && (
                  <span className="flex items-center gap-1 text-dynamic-foreground/60 text-xs">
                    <Lock className="h-3 w-3" />
                    {t('mark-as-confidential')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-dynamic-foreground/60 text-sm">
                {description}
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <Checkbox
              checked={checked}
              onCheckedChange={onCheckedChange}
              disabled={disabled}
            />
          </div>
        </label>
      </TooltipTrigger>
      {disabled && (
        <TooltipContent side="top">
          <p className="text-sm">{t('confidential-toggle-disabled')}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}
