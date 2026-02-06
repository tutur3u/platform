'use client';

import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface CurrencyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange'
  > {
  /** The numeric value (positive number) */
  value: number | undefined;
  /** Called when the value changes */
  onChange: (value: number) => void;
  /** Locale for formatting (defaults to 'en-US') */
  locale?: string;
  /** Maximum fraction digits (defaults to 2) */
  maximumFractionDigits?: number;
  /** Currency symbol to display as prefix */
  currencySymbol?: string;
  /** Currency code or label shown as a muted suffix (e.g. "VND", "USD") */
  currencySuffix?: string;
  /** Hide the quick-action helpers below the input */
  hideHelpers?: boolean;
}

/** Format a number compactly for button labels: 1000 → "1K", 1000000 → "1M" */
function compactLabel(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return String(n);
}

/** Get the rounding unit based on value magnitude */
function getRoundingUnit(v: number): number {
  if (v >= 100_000) return 10_000;
  if (v >= 10_000) return 1_000;
  if (v >= 1_000) return 100;
  if (v >= 100) return 10;
  return 1;
}

/**
 * A currency input component that formats numbers while preserving cursor position.
 *
 * Key behaviors:
 * - While typing: Shows raw number with thousand separators, cursor stays in place
 * - On blur: Formats to locale-specific display
 * - Handles decimal input properly
 * - Supports copy/paste with number extraction
 * - Shows contextual helpers (multipliers, rounding) when focused
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      locale = 'en-US',
      maximumFractionDigits = 2,
      currencySymbol,
      currencySuffix,
      className,
      disabled,
      placeholder = '0',
      hideHelpers,
      ...props
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [displayValue, setDisplayValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    // Track cursor position for restoration after formatting
    const cursorPositionRef = useRef<number | null>(null);
    const previousValueRef = useRef<string>('');

    // Expose the input ref
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // Format number for display (with thousand separators)
    const formatForDisplay = useCallback(
      (num: number | undefined): string => {
        if (num === undefined || num === 0) return '';
        return new Intl.NumberFormat(locale, {
          maximumFractionDigits,
          useGrouping: true,
        }).format(Math.abs(num));
      },
      [locale, maximumFractionDigits]
    );

    // Parse display string back to number
    const parseValue = useCallback((str: string): number => {
      if (!str) return 0;
      // Remove all non-numeric characters except decimal point
      // Handle both comma and period as decimal separators
      const normalized = str
        .replace(/[^\d.,]/g, '')
        // If there are both commas and periods, assume the last one is decimal
        .replace(/,(?=\d{3}(?:[.,]|$))/g, '') // Remove thousand separators (commas followed by 3 digits)
        .replace(/\.(?=\d{3}(?:[.,]|$))/g, '') // Remove thousand separators (periods followed by 3 digits)
        .replace(/,/g, '.'); // Convert remaining commas to periods for parsing

      const parsed = parseFloat(normalized);
      return Number.isNaN(parsed) ? 0 : parsed;
    }, []);

    // Format the raw input while preserving cursor position
    const formatWithCursor = useCallback(
      (
        rawValue: string,
        cursorPos: number
      ): { formatted: string; newCursor: number } => {
        // Extract just the numeric characters and decimal
        const cleanValue = rawValue.replace(/[^\d.]/g, '');

        // Handle multiple decimals - keep only the first
        const parts = cleanValue.split('.');
        let normalized = parts[0] || '';
        if (parts.length > 1) {
          normalized += `.${parts.slice(1).join('').slice(0, maximumFractionDigits)}`;
        }

        if (!normalized) {
          return { formatted: '', newCursor: 0 };
        }

        // Parse and reformat
        const numValue = parseFloat(normalized);
        if (Number.isNaN(numValue)) {
          return { formatted: '', newCursor: 0 };
        }

        // Determine decimal part handling
        const hasDecimal = normalized.includes('.');
        const decimalPart = hasDecimal ? normalized.split('.')[1] || '' : '';

        // Format the integer part
        const integerPart = Math.floor(numValue);
        const formattedInteger = new Intl.NumberFormat(locale, {
          useGrouping: true,
        }).format(integerPart);

        // Build final formatted string
        let formatted = formattedInteger;
        if (hasDecimal) {
          formatted += `.${decimalPart}`;
        }

        // Calculate new cursor position
        // Count how many digits are before the cursor in the original
        let digitsBeforeCursor = 0;
        for (let i = 0; i < cursorPos && i < rawValue.length; i++) {
          if (/[\d.]/.test(rawValue[i]!)) {
            digitsBeforeCursor++;
          }
        }

        // Find where that many digits are in the formatted string
        let newCursor = 0;
        let digitCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (digitCount >= digitsBeforeCursor) break;
          if (/[\d.]/.test(formatted[i]!)) {
            digitCount++;
          }
          newCursor = i + 1;
        }

        return { formatted, newCursor };
      },
      [locale, maximumFractionDigits]
    );

    // Sync external value to display
    useEffect(() => {
      if (!isFocused) {
        setDisplayValue(formatForDisplay(value));
      }
    }, [value, isFocused, formatForDisplay]);

    // Restore cursor position synchronously after React updates the DOM
    // useLayoutEffect runs after DOM mutations but before browser paint,
    // preventing cursor flicker. We check the ref on every render since
    // cursorPositionRef.current is set during handleChange.
    useLayoutEffect(() => {
      if (cursorPositionRef.current !== null && inputRef.current) {
        inputRef.current.setSelectionRange(
          cursorPositionRef.current,
          cursorPositionRef.current
        );
        cursorPositionRef.current = null;
      }
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const cursorPos = e.target.selectionStart ?? rawValue.length;

      // Format with cursor tracking
      const { formatted, newCursor } = formatWithCursor(rawValue, cursorPos);

      // Store cursor position for restoration after render
      cursorPositionRef.current = newCursor;
      previousValueRef.current = formatted;

      setDisplayValue(formatted);

      // Parse and emit the numeric value
      const numericValue = parseValue(formatted);
      onChange(numericValue);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Select all text on focus for easy replacement
      setTimeout(() => {
        e.target.select();
      }, 0);
    };

    const handleBlur = () => {
      setIsFocused(false);
      // Ensure we show the properly formatted value
      setDisplayValue(formatForDisplay(value));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows
      const allowedKeys = [
        'Backspace',
        'Delete',
        'Tab',
        'Escape',
        'Enter',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
      ];
      if (allowedKeys.includes(e.key)) return;

      // Allow Ctrl/Cmd + A, C, V, X
      if (
        (e.ctrlKey || e.metaKey) &&
        ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())
      ) {
        return;
      }

      // Allow numbers and decimal point
      if (/^[\d.]$/.test(e.key)) return;

      // Block all other keys
      e.preventDefault();
    };

    // Apply a helper value — keeps focus on the input
    const applyValue = useCallback(
      (newValue: number) => {
        const clamped = Math.max(0, newValue);
        onChange(clamped);
        setDisplayValue(formatForDisplay(clamped));
        // Re-focus and select after a tick
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 0);
      },
      [onChange, formatForDisplay]
    );

    // Round a number to the configured fraction digits
    const roundToFraction = useCallback(
      (n: number) => {
        const factor = 10 ** maximumFractionDigits;
        return Math.round(n * factor) / factor;
      },
      [maximumFractionDigits]
    );

    // Compute grouped helper sections based on current value
    type HelperItem = {
      label: string;
      value: number;
      variant: 'multiply' | 'divide' | 'preset' | 'round';
    };
    type HelperGroup = { key: string; items: HelperItem[] };

    const helperGroups = useMemo((): HelperGroup[] => {
      if (disabled || hideHelpers) return [];

      const v = value ?? 0;

      if (v <= 0) {
        // Quick presets for empty field
        const presets = [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000];
        return [
          {
            key: 'presets',
            items: presets.map((p) => ({
              label: compactLabel(p),
              value: p,
              variant: 'preset' as const,
            })),
          },
        ];
      }

      const groups: HelperGroup[] = [];

      // Multipliers
      groups.push({
        key: 'multiply',
        items: [
          { label: '×10', value: v * 10, variant: 'multiply' },
          { label: '×100', value: v * 100, variant: 'multiply' },
          { label: '×1K', value: v * 1000, variant: 'multiply' },
        ],
      });

      // Dividers — only show when result is > 0 after rounding
      const divItems: HelperItem[] = [];
      for (const d of [10, 100, 1000]) {
        const result = roundToFraction(v / d);
        if (result > 0) {
          divItems.push({
            label: `÷${compactLabel(d)}`,
            value: result,
            variant: 'divide',
          });
        }
      }
      if (divItems.length > 0) {
        groups.push({ key: 'divide', items: divItems });
      }

      // Smart rounding
      const unit = getRoundingUnit(v);
      if (unit > 1) {
        const roundedDown = Math.floor(v / unit) * unit;
        const roundedUp = Math.ceil(v / unit) * unit;
        const roundItems: HelperItem[] = [];

        if (roundedDown > 0 && roundedDown !== v) {
          roundItems.push({
            label: `↓ ${compactLabel(roundedDown)}`,
            value: roundedDown,
            variant: 'round',
          });
        }
        if (roundedUp !== v) {
          roundItems.push({
            label: `↑ ${compactLabel(roundedUp)}`,
            value: roundedUp,
            variant: 'round',
          });
        }
        if (roundItems.length > 0) {
          groups.push({ key: 'round', items: roundItems });
        }
      }

      return groups;
    }, [value, disabled, hideHelpers, roundToFraction]);

    const showHelpers = isFocused && helperGroups.length > 0;

    return (
      <div>
        <div className="relative">
          {currencySymbol && (
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
              {currencySymbol}
            </span>
          )}
          <Input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            className={cn(
              currencySymbol && 'pl-8',
              currencySuffix && 'pr-14',
              className
            )}
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            {...props}
          />
          {currencySuffix && (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground/60 text-sm">
              {currencySuffix}
            </span>
          )}
        </div>

        {/* Helpers toolbar */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            showHelpers
              ? 'mt-1.5 max-h-24 opacity-100'
              : 'pointer-events-none mt-0 max-h-0 opacity-0'
          )}
        >
          <div className="flex flex-wrap items-center gap-1">
            {helperGroups.map((group, gi) => (
              <div key={group.key} className="contents">
                {gi > 0 && (
                  <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
                )}
                {group.items.map((h) => (
                  <button
                    key={h.label}
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyValue(h.value);
                    }}
                    className={cn(
                      'rounded-md border px-2 py-0.5 font-medium text-xs transition-colors',
                      'select-none outline-none',
                      h.variant === 'multiply' &&
                        'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20',
                      h.variant === 'divide' &&
                        'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20',
                      h.variant === 'preset' &&
                        'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                      h.variant === 'round' &&
                        'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                    )}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
