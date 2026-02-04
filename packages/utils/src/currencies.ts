/**
 * Centralized currency configuration
 *
 * This module provides a single source of truth for all supported currencies.
 * The `SupportedCurrency` type is automatically derived from the array,
 * ensuring type safety without manual maintenance of union types.
 *
 * To add a new currency:
 * 1. Add an entry to SUPPORTED_CURRENCIES below
 * 2. Add translations in apps/web/messages/{en,vi}.json under ws-finance-settings
 */

/**
 * All supported currencies with their locale mappings.
 * Sorted alphabetically by currency code.
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'AED', locale: 'ar-AE', name: 'UAE Dirham' },
  { code: 'AUD', locale: 'en-AU', name: 'Australian Dollar' },
  { code: 'BRL', locale: 'pt-BR', name: 'Brazilian Real' },
  { code: 'CAD', locale: 'en-CA', name: 'Canadian Dollar' },
  { code: 'CHF', locale: 'de-CH', name: 'Swiss Franc' },
  { code: 'CNY', locale: 'zh-CN', name: 'Chinese Yuan' },
  { code: 'CZK', locale: 'cs-CZ', name: 'Czech Koruna' },
  { code: 'DKK', locale: 'da-DK', name: 'Danish Krone' },
  { code: 'EUR', locale: 'de-DE', name: 'Euro' },
  { code: 'GBP', locale: 'en-GB', name: 'British Pound' },
  { code: 'HKD', locale: 'zh-HK', name: 'Hong Kong Dollar' },
  { code: 'HUF', locale: 'hu-HU', name: 'Hungarian Forint' },
  { code: 'IDR', locale: 'id-ID', name: 'Indonesian Rupiah' },
  { code: 'INR', locale: 'hi-IN', name: 'Indian Rupee' },
  { code: 'JPY', locale: 'ja-JP', name: 'Japanese Yen' },
  { code: 'KRW', locale: 'ko-KR', name: 'South Korean Won' },
  { code: 'MXN', locale: 'es-MX', name: 'Mexican Peso' },
  { code: 'MYR', locale: 'ms-MY', name: 'Malaysian Ringgit' },
  { code: 'NOK', locale: 'nb-NO', name: 'Norwegian Krone' },
  { code: 'NZD', locale: 'en-NZ', name: 'New Zealand Dollar' },
  { code: 'PHP', locale: 'en-PH', name: 'Philippine Peso' },
  { code: 'PLN', locale: 'pl-PL', name: 'Polish Zloty' },
  { code: 'SAR', locale: 'ar-SA', name: 'Saudi Riyal' },
  { code: 'SEK', locale: 'sv-SE', name: 'Swedish Krona' },
  { code: 'SGD', locale: 'en-SG', name: 'Singapore Dollar' },
  { code: 'THB', locale: 'th-TH', name: 'Thai Baht' },
  { code: 'TWD', locale: 'zh-TW', name: 'Taiwan Dollar' },
  { code: 'USD', locale: 'en-US', name: 'US Dollar' },
  { code: 'VND', locale: 'vi-VN', name: 'Vietnamese Dong' },
  { code: 'ZAR', locale: 'en-ZA', name: 'South African Rand' },
] as const;

/**
 * Type representing all supported currency codes.
 * Automatically derived from SUPPORTED_CURRENCIES array.
 */
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]['code'];

/**
 * Type for a single currency configuration entry.
 */
export type CurrencyConfig = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Get the locale for a specific currency.
 * Falls back to 'en-US' for unknown currencies.
 *
 * @param currency - The currency code (e.g., 'USD', 'EUR', 'VND')
 * @returns The BCP 47 locale string for the currency
 */
export function getCurrencyLocale(currency = 'VND'): string {
  const found = SUPPORTED_CURRENCIES.find(
    (c) => c.code === currency.toUpperCase()
  );
  return found?.locale ?? 'en-US';
}

/**
 * Check if a currency code is supported.
 *
 * @param currency - The currency code to check
 * @returns True if the currency is supported
 */
export function isSupportedCurrency(
  currency: string
): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.some((c) => c.code === currency.toUpperCase());
}

/**
 * Get the full configuration for a currency.
 *
 * @param currency - The currency code
 * @returns The currency configuration or undefined if not found
 */
export function getCurrencyConfig(
  currency: string
): CurrencyConfig | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === currency.toUpperCase());
}
