import { describe, expect, it } from 'vitest';
import {
  formatFieldName,
  formatValue,
} from '@/components/notifications/notification-utils';

describe('notification-utils', () => {
  describe('formatFieldName', () => {
    it('should return mapped names for known fields', () => {
      expect(formatFieldName('name')).toBe('Title');
      expect(formatFieldName('description')).toBe('Description');
      expect(formatFieldName('priority')).toBe('Priority');
      expect(formatFieldName('due_date')).toBe('Due Date');
      expect(formatFieldName('start_date')).toBe('Start Date');
      expect(formatFieldName('estimation')).toBe('Estimation');
      expect(formatFieldName('completed')).toBe('Status');
      expect(formatFieldName('label_name')).toBe('Label');
    });

    it('should return "List" for list_id field', () => {
      expect(formatFieldName('list_id')).toBe('List');
    });

    it('should format unknown fields by replacing underscores and capitalizing', () => {
      expect(formatFieldName('unknown_field')).toBe('Unknown Field');
      expect(formatFieldName('some_other_value')).toBe('Some Other Value');
      expect(formatFieldName('simple')).toBe('Simple');
    });
  });

  describe('formatValue', () => {
    describe('null and undefined values', () => {
      it('should return "Not set" for null values', () => {
        expect(formatValue(null, 'any_field')).toBe('Not set');
      });

      it('should return "Not set" for undefined values', () => {
        expect(formatValue(undefined, 'any_field')).toBe('Not set');
      });
    });

    describe('boolean values', () => {
      it('should format boolean true as "Completed"', () => {
        expect(formatValue(true, 'completed')).toBe('Completed');
      });

      it('should format boolean false as "Not completed"', () => {
        expect(formatValue(false, 'completed')).toBe('Not completed');
      });
    });

    describe('priority field', () => {
      it('should format priority values with proper casing', () => {
        expect(formatValue('low', 'priority')).toBe('Low');
        expect(formatValue('medium', 'priority')).toBe('Medium');
        expect(formatValue('high', 'priority')).toBe('High');
        expect(formatValue('urgent', 'priority')).toBe('Urgent');
      });

      it('should handle uppercase priority values', () => {
        expect(formatValue('LOW', 'priority')).toBe('Low');
        expect(formatValue('HIGH', 'priority')).toBe('High');
      });

      it('should capitalize unknown priority values', () => {
        expect(formatValue('custom', 'priority')).toBe('Custom');
      });
    });

    describe('date fields', () => {
      it('should format ISO date strings for due_date', () => {
        const result = formatValue('2024-12-15T10:00:00Z', 'due_date');
        expect(result).toContain('Dec');
        expect(result).toContain('15');
        expect(result).toContain('2024');
      });

      it('should format ISO date strings for start_date', () => {
        const result = formatValue('2024-01-01T00:00:00Z', 'start_date');
        expect(result).toContain('Jan');
        expect(result).toContain('1');
        expect(result).toContain('2024');
      });

      it('should format ISO date strings for end_date', () => {
        // Use a mid-month date to avoid timezone boundary issues
        const result = formatValue('2024-06-15T12:00:00Z', 'end_date');
        expect(result).toContain('Jun');
        expect(result).toContain('15');
        expect(result).toContain('2024');
      });

      it('should return capitalized value for non-ISO date strings', () => {
        expect(formatValue('tomorrow', 'due_date')).toBe('Tomorrow');
      });
    });

    describe('estimation field', () => {
      it('should format estimation as hours with plural', () => {
        expect(formatValue(5, 'estimation')).toBe('5 hours');
        expect(formatValue(2, 'estimation')).toBe('2 hours');
        expect(formatValue(0, 'estimation')).toBe('0 hours');
      });

      it('should format estimation as hour with singular', () => {
        expect(formatValue(1, 'estimation')).toBe('1 hour');
      });

      it('should handle estimation_points field similarly', () => {
        expect(formatValue(3, 'estimation_points')).toBe('3 hours');
        expect(formatValue(1, 'estimation_points')).toBe('1 hour');
      });

      it('should return string value for non-numeric estimation', () => {
        expect(formatValue('large', 'estimation')).toBe('large');
      });
    });

    describe('string values', () => {
      it('should capitalize first letter of string values', () => {
        expect(formatValue('hello world', 'any_field')).toBe('Hello world');
        expect(formatValue('test', 'any_field')).toBe('Test');
      });

      it('should truncate long strings', () => {
        const longString = 'a'.repeat(100);
        const result = formatValue(longString, 'any_field');
        expect(result.length).toBeLessThanOrEqual(53); // 50 chars + '...'
        expect(result).toContain('...');
      });

      it('should not truncate short strings', () => {
        const shortString = 'Short text';
        expect(formatValue(shortString, 'any_field')).toBe('Short text');
      });
    });

    describe('other values', () => {
      it('should convert numbers to strings', () => {
        expect(formatValue(42, 'some_field')).toBe('42');
      });

      it('should handle objects by converting to string', () => {
        expect(formatValue({}, 'some_field')).toBe('[object Object]');
      });
    });
  });
});
