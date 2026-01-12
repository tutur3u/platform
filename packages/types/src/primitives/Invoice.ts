export interface Invoice {
  id: string;
  price?: number;
  total_diff?: number;
  note?: string;
  notice?: string;
  customer_id?: string;
  customer?: {
    full_name?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  creator_id?: string;
  creator?: {
    id: string;
    full_name?: string | null;
    display_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
  platform_creator_id?: string;
  ws_id?: string;
  completed_at?: string;
  transaction_id?: string;
  created_at?: string;
  href?: string;
}

/**
 * Represents invoice totals for a specific time period and wallet
 * Used by invoice analytics charts (daily, weekly, monthly views)
 */
export interface InvoiceTotalsByPeriod {
  period: string; // ISO date string (YYYY-MM-DD)
  wallet_id: string;
  wallet_name: string;
  total_amount: number;
  invoice_count: number;
}

/**
 * Time period options for invoice analytics
 */
export type InvoiceAnalyticsPeriod = 'daily' | 'weekly' | 'monthly';

/**
 * Metric type options for invoice analytics
 */
export type InvoiceAnalyticsMetric = 'amount' | 'count';
