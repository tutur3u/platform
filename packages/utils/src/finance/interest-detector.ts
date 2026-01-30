/**
 * Interest Transaction Detector
 *
 * Automatically detects interest transactions from Momo/ZaloPay
 * based on description patterns and expected amounts.
 */

import type { DetectedInterestTransaction } from '@tuturuuu/types';

/**
 * Patterns to match interest transaction descriptions in Vietnamese and English
 */
const INTEREST_DESCRIPTION_PATTERNS: RegExp[] = [
  // Vietnamese patterns
  /lãi\s*suất/i,
  /lãi\s*hàng\s*ngày/i,
  /tiền\s*lãi/i,
  /lãi\s*tiết\s*kiệm/i,
  /sinh\s*lời/i,
  /lợi\s*nhuận/i,
  // English patterns
  /interest/i,
  /daily\s*interest/i,
  /interest\s*earned/i,
  /interest\s*payment/i,
  // Provider-specific patterns
  /momo\s*(interest|reward|lãi)/i,
  /zalopay\s*(interest|reward|lãi)/i,
  /ví\s*(momo|zalopay).*lãi/i,
];

/**
 * Transaction input for detection
 */
export interface TransactionForDetection {
  id: string;
  amount: number;
  description: string | null;
  date: string;
}

/**
 * Detect if a single transaction is likely an interest payment
 *
 * @param transaction - The transaction to analyze
 * @param expectedDailyInterest - Expected daily interest (optional, improves detection)
 * @param tolerance - Amount matching tolerance (default 10%)
 * @returns DetectedInterestTransaction if detected, null otherwise
 */
export function detectInterestTransaction(
  transaction: TransactionForDetection,
  expectedDailyInterest?: number,
  tolerance = 0.1
): DetectedInterestTransaction | null {
  // Interest must be positive (income)
  if (transaction.amount <= 0) return null;

  const desc = transaction.description || '';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  const matchReasons: string[] = [];

  // Check description patterns
  const descriptionMatch = INTEREST_DESCRIPTION_PATTERNS.some((pattern) =>
    pattern.test(desc)
  );

  if (descriptionMatch) {
    confidence = 'high';
    matchReasons.push('Description matches interest pattern');
  }

  // Check amount if expected daily interest is known
  if (expectedDailyInterest && expectedDailyInterest > 0) {
    const amountDiff =
      Math.abs(transaction.amount - expectedDailyInterest) /
      expectedDailyInterest;
    if (amountDiff <= tolerance) {
      // Amount matches expected - boost confidence
      if (descriptionMatch) {
        confidence = 'high';
      } else {
        confidence = 'medium';
      }
      matchReasons.push('Amount matches expected daily interest');
    }
  }

  // Only return if we have at least description match or expected amount match
  // Small amounts alone are not reliable indicators (too many false positives)
  if (matchReasons.length === 0) {
    return null;
  }

  return {
    transactionId: transaction.id,
    date: transaction.date,
    amount: transaction.amount,
    description: desc,
    confidence,
    matchReason: matchReasons.join('; '),
  };
}

/**
 * Scan multiple transactions and detect all interest payments
 *
 * @param transactions - Array of transactions to scan
 * @param expectedDailyInterest - Expected daily interest (optional)
 * @returns Array of detected interest transactions, sorted by date descending
 */
export function detectInterestTransactions(
  transactions: TransactionForDetection[],
  expectedDailyInterest?: number
): DetectedInterestTransaction[] {
  return transactions
    .map((t) => detectInterestTransaction(t, expectedDailyInterest))
    .filter((t): t is DetectedInterestTransaction => t !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Summarize detection results
 *
 * @param detected - Array of detected transactions
 * @returns Summary with counts by confidence level
 */
export function summarizeDetectionResults(
  detected: DetectedInterestTransaction[]
): {
  totalAmount: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
} {
  return {
    totalAmount: detected.reduce((sum, t) => sum + t.amount, 0),
    highConfidence: detected.filter((t) => t.confidence === 'high').length,
    mediumConfidence: detected.filter((t) => t.confidence === 'medium').length,
    lowConfidence: detected.filter((t) => t.confidence === 'low').length,
  };
}
