import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const capitalize = (s?: string | null): string => {
  if (!s) return '';
  if (s.length === 0) return s;
  if (s.length === 1) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function formatBytes(
  bytes: number,
  opts: {
    decimals?: number;
    sizeType?: 'accurate' | 'normal';
  } = {}
): string {
  const { decimals = 0, sizeType = 'normal' } = opts;

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const accurateSizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
  if (bytes === 0) return '0 Byte';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(decimals)} ${
    sizeType === 'accurate'
      ? (accurateSizes[i] ?? 'Bytest')
      : (sizes[i] ?? 'Bytes')
  }`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (remainingSeconds > 0 && hours === 0) {
    // Only show seconds if less than 1 hour
    parts.push(
      `${remainingSeconds} ${remainingSeconds === 1 ? 'second' : 'seconds'}`
    );
  }

  return parts.join(' ');
}

/**
 * Validates if a URL is a safe blob URL
 */
export function isValidBlobUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  const s = url.trim();
  return s.toLowerCase().startsWith('blob:');
}

/**
 * Validates if a URL is a safe HTTP or HTTPS URL
 */
export function isValidHttpUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  const s = url.trim();
  try {
    const parsedUrl = new URL(s);
    const protocol = parsedUrl.protocol.toLowerCase();
    // Require a hostname to avoid odd cases like "http:/foo"
    return (
      (protocol === 'http:' || protocol === 'https:') && !!parsedUrl.hostname
    );
  } catch {
    return false;
  }
}

/**
 * Format a number as currency with locale-specific formatting
 * @param amount - The amount to format
 * @param locale - The locale to use (default: 'vi-VN')
 * @param currency - The currency code (default: 'VND')
 * @param options - Additional Intl.NumberFormat options
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  locale = 'vi-VN',
  currency = 'VND',
  options?: Partial<Intl.NumberFormatOptions>
): string {
  const { signDisplay = 'auto', ...rest } = options || {};
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay,
    ...rest,
  }).format(amount);
}
