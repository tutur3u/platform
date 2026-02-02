'use client';

import { cn, formatCurrency } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Card } from '../../card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../tooltip';

// Cookie helper function
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    if (!c) continue;
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

interface Props {
  title?: string;
  value?: string | number | null;
  href?: string;
  className?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  currency?: string;
  locale?: string;
}

const StatisticCard = ({
  title,
  value,
  href,
  className,
  onClick,
  icon,
  trend,
  currency,
  locale = 'vi-VN',
}: Props) => {
  const [isConfidential, setIsConfidential] = useState(true); // Default to hidden

  // Load confidential mode from cookie on mount
  useEffect(() => {
    const saved = getCookie('finance-confidential-mode');
    if (saved !== null) {
      setIsConfidential(saved === 'true');
    }

    // Listen for changes from other components
    const handleStorageChange = () => {
      const newValue = getCookie('finance-confidential-mode');
      if (newValue !== null) {
        setIsConfidential(newValue === 'true');
      }
    };

    // Custom event for same-tab updates
    window.addEventListener(
      'finance-confidential-mode-change',
      handleStorageChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'finance-confidential-mode-change',
        handleStorageChange as EventListener
      );
    };
  }, []);

  const formatValue = (
    val: string | number | null | undefined
  ): { display: string; full: string; isCompact: boolean } => {
    if (val === null || val === undefined)
      return { display: 'N/A', full: 'N/A', isCompact: false };

    // If already a string, return it
    if (typeof val === 'string')
      return { display: val, full: val, isCompact: false };

    // For numbers, determine if it's a count (small integer) or currency
    const isCount = Number.isInteger(val) && Math.abs(val) < 10000 && !currency;
    const absValue = Math.abs(val);

    // Format counts (small integers) without currency
    if (isCount || !currency) {
      const formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
      return { display: formatted, full: formatted, isCompact: false };
    }

    // Full value always in standard format
    const fullValue = formatCurrency(val, currency, locale);

    // Use compact notation for large currency values (>= 10 million)
    if (absValue >= 10_000_000) {
      const compactValue = formatCurrency(val, currency, locale, {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      });
      return { display: compactValue, full: fullValue, isCompact: true };
    }

    // Use standard currency formatting for smaller numbers
    return { display: fullValue, full: fullValue, isCompact: false };
  };

  const formattedValue = formatValue(value);
  const displayValue = isConfidential ? '•••••' : formattedValue.display;

  // Responsive font sizing based on value length
  const getFontSizeClass = (val: string): string => {
    const length = val.length;
    if (length > 20) return 'text-xl sm:text-2xl';
    if (length > 15) return 'text-2xl';
    return 'text-3xl';
  };

  const content = (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-200',
        (onClick || href) &&
          'cursor-pointer hover:border-foreground/20 hover:shadow-md',
        className
      )}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-2 font-medium text-muted-foreground text-sm">
              {title}
            </p>
            <div className="flex flex-wrap items-baseline gap-2">
              {!isConfidential && formattedValue.isCompact ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p
                        className={cn(
                          'wrap-break-word min-w-0 cursor-help font-bold text-foreground tracking-tight',
                          getFontSizeClass(displayValue)
                        )}
                      >
                        {displayValue}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">{formattedValue.full}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <p
                  className={cn(
                    'wrap-break-word min-w-0 font-bold text-foreground tracking-tight',
                    getFontSizeClass(displayValue)
                  )}
                >
                  {displayValue}
                </p>
              )}
              {trend && (
                <span
                  className={cn(
                    'whitespace-nowrap font-medium text-xs',
                    trend.isPositive
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
                </span>
              )}
            </div>
          </div>
          {icon && (
            <div className="shrink-0 rounded-lg bg-muted p-3 text-muted-foreground">
              {icon}
            </div>
          )}
        </div>
      </div>

      {/* Hover effect gradient */}
      {(onClick || href) && (
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-transparent via-transparent to-foreground/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      )}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className="block">
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
      >
        {content}
      </button>
    );
  }

  return content;
};

export default StatisticCard;
