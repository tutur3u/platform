/**
 * Wallet Interest Types
 *
 * Support for Momo/ZaloPay high-interest savings programs.
 * Interest tracking is OPT-IN ONLY - users must explicitly enable it.
 */

// Provider types
export type WalletInterestProvider = 'momo' | 'zalopay';
export type ZaloPayTier = 'standard' | 'gold' | 'diamond';

// Provider rate constants (annual rates in percentage)
export const MOMO_RATE = 4.0;
export const ZALOPAY_RATES: Record<ZaloPayTier, number> = {
  standard: 4.5,
  gold: 4.8,
  diamond: 5.0,
};

// Get default rate for a provider/tier combination
export function getDefaultRate(
  provider: WalletInterestProvider,
  tier?: ZaloPayTier | null
): number {
  if (provider === 'momo') {
    return MOMO_RATE;
  }
  return ZALOPAY_RATES[tier ?? 'standard'];
}

/**
 * Interest configuration for a wallet (opt-in feature)
 */
export interface WalletInterestConfig {
  id: string;
  wallet_id: string;
  provider: WalletInterestProvider;
  zalopay_tier: ZaloPayTier | null;
  enabled: boolean;
  last_calculated_at: string | null;
  last_interest_amount: number;
  total_interest_earned: number;
  /** Only transactions on or after this date are considered for interest calculation. NULL means from wallet creation. */
  tracking_start_date: string | null;
  /** Transactions after this date are excluded. NULL means ongoing (no end date). */
  tracking_end_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Rate history entry for tracking provider rate changes
 */
export interface WalletInterestRate {
  id: string;
  config_id: string;
  annual_rate: number;
  effective_from: string; // DATE string (YYYY-MM-DD)
  effective_to: string | null; // DATE string or null if current
  created_at: string;
}

/**
 * Vietnamese holiday for business day calculation
 */
export interface VietnameseHoliday {
  id: string;
  date: string; // DATE string (YYYY-MM-DD)
  name: string;
  year: number;
  created_at: string;
}

/**
 * Daily interest calculation result
 */
export interface DailyInterestResult {
  date: string; // DATE string (YYYY-MM-DD)
  balance: number; // Balance at start of day
  rate: number; // Annual rate as percentage
  dailyInterest: number; // Interest earned this day (floored)
  isBusinessDay: boolean;
  cumulativeInterest: number; // Total interest up to this day
}

/**
 * Interest projection for future dates
 */
export interface InterestProjection {
  date: string; // DATE string (YYYY-MM-DD)
  projectedBalance: number;
  projectedDailyInterest: number;
  projectedCumulativeInterest: number;
  isBusinessDay: boolean;
}

/**
 * Complete interest summary for a wallet
 */
export interface InterestSummary {
  config: WalletInterestConfig;
  currentRate: WalletInterestRate | null;
  rateHistory: WalletInterestRate[];

  // Calculated values
  todayInterest: number;
  monthToDateInterest: number;
  yearToDateInterest: number;
  totalEarnedInterest: number;

  // Pending interest info (for recent deposits with delayed start)
  pendingDeposits: PendingDepositInfo[];

  // Projections
  projections: {
    week: InterestProjection[];
    month: InterestProjection[];
    quarter: InterestProjection[];
    year: InterestProjection[];
  };

  // Summary statistics
  averageDailyInterest: number;
  estimatedMonthlyInterest: number;
  estimatedYearlyInterest: number;
}

/**
 * Information about a pending deposit that hasn't started earning interest yet
 */
export interface PendingDepositInfo {
  depositDate: string;
  amount: number;
  interestStartDate: string;
  daysUntilInterest: number;
}

/**
 * Parameters for interest calculation
 */
export interface InterestCalculationParams {
  transactions: {
    date: string;
    amount: number; // Positive for deposits, negative for withdrawals
  }[];
  rates: WalletInterestRate[];
  holidays: string[]; // Array of DATE strings (YYYY-MM-DD)
  fromDate: string;
  toDate: string;
  initialBalance?: number;
}

/**
 * Result of interest calculation
 */
export interface InterestCalculationResult {
  dailyResults: DailyInterestResult[];
  totalInterest: number;
  finalBalance: number;
  businessDaysCount: number;
  nonBusinessDaysCount: number;
}

/**
 * Parameters for interest projection
 */
export interface InterestProjectionParams {
  currentBalance: number;
  currentRate: number;
  holidays: string[]; // Array of DATE strings (YYYY-MM-DD)
  days: number;
  startDate?: string; // Defaults to today
}

/**
 * Config creation input
 */
export interface CreateInterestConfigInput {
  wallet_id: string;
  provider: WalletInterestProvider;
  zalopay_tier?: ZaloPayTier | null;
  initial_rate?: number; // If not provided, uses default for provider/tier
  /** Only transactions on or after this date are considered. Defaults to today if not provided. */
  tracking_start_date?: string | null;
}

/**
 * Config update input
 */
export interface UpdateInterestConfigInput {
  zalopay_tier?: ZaloPayTier | null;
  enabled?: boolean;
  /** Only transactions on or after this date are considered for interest calculation. */
  tracking_start_date?: string | null;
  /** Transactions after this date are excluded. */
  tracking_end_date?: string | null;
}

/**
 * Rate creation input
 */
export interface CreateInterestRateInput {
  config_id: string;
  annual_rate: number;
  effective_from: string; // DATE string (YYYY-MM-DD)
}

/**
 * Holiday creation input
 */
export interface CreateHolidayInput {
  date: string; // DATE string (YYYY-MM-DD)
  name: string;
}

/**
 * Holiday update input
 */
export interface UpdateHolidayInput {
  date?: string;
  name?: string;
}

/**
 * Bulk holiday import input
 */
export interface BulkHolidayImportInput {
  holidays: CreateHolidayInput[];
  /** If true, replaces all holidays for the affected years */
  replaceExisting?: boolean;
}

/**
 * Provider detection result from wallet image_src
 */
export interface ProviderDetectionResult {
  isEligible: boolean;
  provider: WalletInterestProvider | null;
  suggestedTier?: ZaloPayTier;
}

/**
 * Detected interest transaction from auto-detection
 */
export interface DetectedInterestTransaction {
  transactionId: string;
  date: string;
  amount: number;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  matchReason: string;
}

/**
 * Result of interest transaction detection scan
 */
export interface InterestDetectionResult {
  detected: DetectedInterestTransaction[];
  totalAmount: number;
  summary: {
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
}

/**
 * Image source patterns for provider detection
 */
export const PROVIDER_IMAGE_PATTERNS: Record<WalletInterestProvider, RegExp[]> =
  {
    momo: [/momo/i, /mo-mo/i],
    zalopay: [/zalopay/i, /zalo-pay/i, /zalo_pay/i],
  };

/**
 * Detect provider from wallet image_src
 */
export function detectProviderFromImage(
  imageSrc: string | null | undefined
): ProviderDetectionResult {
  if (!imageSrc) {
    return { isEligible: false, provider: null };
  }

  for (const [provider, patterns] of Object.entries(PROVIDER_IMAGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(imageSrc)) {
        return {
          isEligible: true,
          provider: provider as WalletInterestProvider,
          suggestedTier: provider === 'zalopay' ? 'standard' : undefined,
        };
      }
    }
  }

  return { isEligible: false, provider: null };
}
