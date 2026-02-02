import { describe, expect, it } from 'vitest';

import {
  detectInterestTransaction,
  detectInterestTransactions,
  summarizeDetectionResults,
  type TransactionForDetection,
} from '../finance/interest-detector';

describe('interest-detector', () => {
  describe('detectInterestTransaction', () => {
    it('should detect transaction with Vietnamese interest keyword in description', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 1000,
        description: 'Tiền lãi hàng ngày',
        date: '2025-01-15',
      };

      const result = detectInterestTransaction(tx);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('high');
      expect(result?.matchReason).toContain(
        'Description matches interest pattern'
      );
    });

    it('should detect transaction with English interest keyword', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 1000,
        description: 'Daily interest payment',
        date: '2025-01-15',
      };

      const result = detectInterestTransaction(tx);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('high');
    });

    it('should detect Momo-specific patterns', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 1000,
        description: 'Momo interest reward',
        date: '2025-01-15',
      };

      const result = detectInterestTransaction(tx);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('high');
    });

    it('should return null for negative amounts (expenses)', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: -1000,
        description: 'Tiền lãi',
        date: '2025-01-15',
      };

      const result = detectInterestTransaction(tx);
      expect(result).toBeNull();
    });

    it('should return null for zero amounts', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 0,
        description: 'Tiền lãi',
        date: '2025-01-15',
      };

      const result = detectInterestTransaction(tx);
      expect(result).toBeNull();
    });

    it('should return null for unrelated descriptions', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 50000,
        description: 'Coffee purchase',
        date: '2025-01-15',
      };

      const result = detectInterestTransaction(tx);
      expect(result).toBeNull();
    });

    it('should have medium confidence when amount matches expected daily interest', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 1000,
        description: null,
        date: '2025-01-15',
      };

      // If expected daily interest is 1000, and amount is 1000, should be medium confidence
      const result = detectInterestTransaction(tx, 1000);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('medium');
      expect(result?.matchReason).toContain(
        'Amount matches expected daily interest'
      );
    });

    it('should have high confidence when description matches AND amount matches', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 1000,
        description: 'Tiền lãi',
        date: '2025-01-15',
      };

      const result = detectInterestTransaction(tx, 1000);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('high');
    });

    it('should handle null description', () => {
      const tx: TransactionForDetection = {
        id: '1',
        amount: 50000,
        description: null,
        date: '2025-01-15',
      };

      // Without description match or amount match, should return null
      const result = detectInterestTransaction(tx);
      expect(result).toBeNull();
    });
  });

  describe('detectInterestTransactions', () => {
    it('should detect multiple interest transactions', () => {
      const transactions: TransactionForDetection[] = [
        { id: '1', amount: 1000, description: 'Tiền lãi', date: '2025-01-15' },
        { id: '2', amount: -500, description: 'Coffee', date: '2025-01-15' },
        {
          id: '3',
          amount: 1100,
          description: 'Daily interest',
          date: '2025-01-16',
        },
        { id: '4', amount: 500000, description: 'Salary', date: '2025-01-17' }, // Large amount not matching pattern
      ];

      const results = detectInterestTransactions(transactions);
      expect(results).toHaveLength(2);
      expect(results[0]?.transactionId).toBe('3'); // Sorted by date desc
      expect(results[1]?.transactionId).toBe('1');
    });

    it('should sort results by date descending', () => {
      const transactions: TransactionForDetection[] = [
        { id: '1', amount: 1000, description: 'Lãi suất', date: '2025-01-10' },
        { id: '2', amount: 1000, description: 'Lãi suất', date: '2025-01-20' },
        { id: '3', amount: 1000, description: 'Lãi suất', date: '2025-01-15' },
      ];

      const results = detectInterestTransactions(transactions);
      expect(results[0]?.date).toBe('2025-01-20');
      expect(results[1]?.date).toBe('2025-01-15');
      expect(results[2]?.date).toBe('2025-01-10');
    });

    it('should return empty array for no matches', () => {
      const transactions: TransactionForDetection[] = [
        { id: '1', amount: -500, description: 'Coffee', date: '2025-01-15' },
        { id: '2', amount: 500000, description: 'Salary', date: '2025-01-17' }, // Large amount, no pattern match
      ];

      const results = detectInterestTransactions(transactions);
      expect(results).toHaveLength(0);
    });
  });

  describe('summarizeDetectionResults', () => {
    it('should summarize detection results correctly', () => {
      const detected = [
        {
          transactionId: '1',
          date: '2025-01-15',
          amount: 1000,
          description: 'Tiền lãi',
          confidence: 'high' as const,
          matchReason: 'Description matches',
        },
        {
          transactionId: '2',
          date: '2025-01-16',
          amount: 1100,
          description: '',
          confidence: 'medium' as const,
          matchReason: 'Amount matches',
        },
        {
          transactionId: '3',
          date: '2025-01-17',
          amount: 500,
          description: '',
          confidence: 'low' as const,
          matchReason: 'Small amount',
        },
      ];

      const summary = summarizeDetectionResults(detected);
      expect(summary.totalAmount).toBe(2600);
      expect(summary.highConfidence).toBe(1);
      expect(summary.mediumConfidence).toBe(1);
      expect(summary.lowConfidence).toBe(1);
    });

    it('should handle empty array', () => {
      const summary = summarizeDetectionResults([]);
      expect(summary.totalAmount).toBe(0);
      expect(summary.highConfidence).toBe(0);
      expect(summary.mediumConfidence).toBe(0);
      expect(summary.lowConfidence).toBe(0);
    });
  });
});
