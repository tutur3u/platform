'use client';

import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
}

/**
 * A currency input component that formats numbers while preserving cursor position.
 *
 * Key behaviors:
 * - While typing: Shows raw number with thousand separators, cursor stays in place
 * - On blur: Formats to locale-specific display
 * - Handles decimal input properly
 * - Supports copy/paste with number extraction
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      locale = 'en-US',
      maximumFractionDigits = 2,
      currencySymbol,
      className,
      disabled,
      placeholder = '0',
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

    return (
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
          className={cn(currencySymbol && 'pl-8', className)}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          {...props}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
