import { describe, expect, it } from 'vitest';
import {
  type Benefit,
  type BreakRecord,
  calculatePayroll,
  type Holiday,
  type PayrollCalculationInput,
  type RateOverride,
  type TimeSession,
  type UserCompensation,
} from '../payroll/calculation-engine';

// ==================== TEST DATA SETUP ====================

const DEFAULT_COMPENSATION: UserCompensation = {
  base_hourly_rate: 50000, // 50,000 VND/hour
  overtime_threshold_daily_hours: 8,
  overtime_multiplier_daily: 1.5,
  overtime_multiplier_weekend: 2.0,
  overtime_multiplier_holiday: 3.0,
  insurance_salary: 10000000, // 10M VND
  gross_salary: 10000000,
  region_min_wage: 4680000,
  base_salary: 2340000,
  is_union_member: false,
  has_social_insurance: true,
};

const VIETNAMESE_HOLIDAYS: Holiday[] = [
  {
    holiday_date: '2026-02-17',
    overtime_multiplier: 3.0,
    name: 'Tết Nguyên Đán (Ngày 1)',
  },
  {
    holiday_date: '2026-09-02',
    overtime_multiplier: 3.0,
    name: 'Ngày Quốc Khánh',
  },
];

function createSession(
  id: string,
  date: string,
  hours: number,
  taskId?: string
): TimeSession {
  const startTime = `${date}T09:00:00Z`;
  const endTime = new Date(
    new Date(startTime).getTime() + hours * 3600 * 1000
  ).toISOString();

  return {
    id,
    start_time: startTime,
    end_time: endTime,
    duration_seconds: hours * 3600,
    task_id: taskId || null,
    date,
  };
}

function createBreak(sessionId: string, minutes: number): BreakRecord {
  return {
    session_id: sessionId,
    break_duration_seconds: minutes * 60,
  };
}

// ==================== TESTS ====================

describe('Payroll Calculation Engine', () => {
  describe('Regular Hours (No Overtime, No Breaks)', () => {
    it('should calculate regular 8-hour weekday correctly', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8)], // Monday
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(8);
      expect(result.overtime_hours).toBe(0);
      expect(result.hourly_rate).toBe(50000);
      expect(result.hourly_pay).toBe(8 * 50000); // 400,000 VND
      expect(result.overtime_pay).toBe(0);
      expect(result.gross_pay).toBeGreaterThan(0);
    });

    it('should calculate partial hours correctly', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 4.5)],
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(4.5);
      expect(result.overtime_hours).toBe(0);
      expect(result.hourly_pay).toBe(4.5 * 50000); // 225,000 VND
    });
  });

  describe('Daily Overtime', () => {
    it('should apply 1.5x multiplier for hours beyond 8 on weekdays', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 10)], // 10 hours
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(8);
      expect(result.overtime_hours).toBe(2);
      expect(result.hourly_pay).toBe(8 * 50000); // 400,000 VND
      expect(result.overtime_pay).toBe(2 * 50000 * 1.5); // 150,000 VND
      expect(result.gross_pay).toBeGreaterThanOrEqual(400000 + 150000);
    });

    it('should handle multiple sessions on same day', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [
          createSession('session-1', '2026-01-05', 5),
          createSession('session-2', '2026-01-05', 4),
        ],
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(8);
      expect(result.overtime_hours).toBe(1);
      expect(result.overtime_pay).toBe(1 * 50000 * 1.5); // 75,000 VND
    });
  });

  describe('Weekend Overtime', () => {
    it('should apply 2x multiplier for Saturday work', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-03', 8)], // Saturday
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(0);
      expect(result.overtime_hours).toBe(8);
      expect(result.hourly_pay).toBe(0);
      expect(result.overtime_pay).toBe(8 * 50000 * 2.0); // 800,000 VND

      const dailyBreakdown = result.daily_breakdown[0];
      expect(dailyBreakdown).toBeDefined();
      expect(dailyBreakdown?.is_weekend).toBe(true);
      expect(dailyBreakdown?.overtime_multiplier).toBe(2.0);
    });

    it('should apply 2x multiplier for Sunday work', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-04', 6)], // Sunday
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.overtime_hours).toBe(6);
      expect(result.overtime_pay).toBe(6 * 50000 * 2.0); // 600,000 VND
    });
  });

  describe('Holiday Overtime', () => {
    it('should apply 3x multiplier for Tết (Vietnamese New Year)', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-02-17', 8)], // Tết Day 1
        breaks: [],
        rate_overrides: [],
        holidays: VIETNAMESE_HOLIDAYS,
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-02-01',
        period_end: '2026-02-28',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(0);
      expect(result.overtime_hours).toBe(8);
      expect(result.overtime_pay).toBe(8 * 50000 * 3.0); // 1,200,000 VND

      const dailyBreakdown = result.daily_breakdown[0];
      expect(dailyBreakdown).toBeDefined();
      expect(dailyBreakdown?.is_holiday).toBe(true);
      expect(dailyBreakdown?.holiday_name).toBe('Tết Nguyên Đán (Ngày 1)');
      expect(dailyBreakdown?.overtime_multiplier).toBe(3.0);
    });

    it('should apply 3x multiplier for National Day', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-09-02', 8)],
        breaks: [],
        rate_overrides: [],
        holidays: VIETNAMESE_HOLIDAYS,
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-09-01',
        period_end: '2026-09-30',
      };

      const result = calculatePayroll(input);

      expect(result.overtime_hours).toBe(8);
      expect(result.overtime_pay).toBe(8 * 50000 * 3.0); // 1,200,000 VND
    });

    it('should prioritize holiday over weekend multiplier', () => {
      // If a holiday falls on a weekend, holiday multiplier takes precedence
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-02-17', 8)], // Tết (Tuesday)
        breaks: [],
        rate_overrides: [],
        holidays: VIETNAMESE_HOLIDAYS,
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-02-01',
        period_end: '2026-02-28',
      };

      const result = calculatePayroll(input);

      const dailyBreakdown = result.daily_breakdown[0];
      expect(dailyBreakdown).toBeDefined();
      expect(dailyBreakdown?.overtime_multiplier).toBe(3.0);
      expect(dailyBreakdown?.is_holiday).toBe(true);
    });
  });

  describe('Break Deduction', () => {
    it('should subtract break time from billable hours', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8)],
        breaks: [createBreak('session-1', 60)], // 1 hour break
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      // 8 hours - 1 hour break = 7 billable hours
      expect(result.regular_hours).toBe(7);
      expect(result.overtime_hours).toBe(0);
      expect(result.hourly_pay).toBe(7 * 50000); // 350,000 VND
    });

    it('should handle multiple breaks in a session', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 9)],
        breaks: [
          createBreak('session-1', 30), // 30 min
          createBreak('session-1', 15), // 15 min
        ],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      // 9 hours - 0.75 hour breaks = 8.25 billable hours
      expect(result.regular_hours).toBe(8);
      expect(result.overtime_hours).toBe(0.25);
      expect(result.overtime_pay).toBe(0.25 * 50000 * 1.5); // 18,750 VND
    });

    it('should apply break deduction before calculating overtime', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 10)],
        breaks: [createBreak('session-1', 60)], // 1 hour break
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      // 10 hours - 1 hour break = 9 billable hours
      // 8 regular + 1 overtime
      expect(result.regular_hours).toBe(8);
      expect(result.overtime_hours).toBe(1);
      expect(result.overtime_pay).toBe(1 * 50000 * 1.5); // 75,000 VND
    });
  });

  describe('Project Rate Overrides', () => {
    it('should use task-specific rate when available', () => {
      const rateOverrides: RateOverride[] = [
        {
          task_id: 'task-premium',
          hourly_rate: 75000, // Premium rate
          effective_from: '2026-01-01',
          effective_until: null,
        },
      ];

      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8, 'task-premium')],
        breaks: [],
        rate_overrides: rateOverrides,
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(8);
      expect(result.hourly_pay).toBe(8 * 75000); // 600,000 VND (premium rate)
    });

    it('should use base rate when no override matches', () => {
      const rateOverrides: RateOverride[] = [
        {
          task_id: 'task-premium',
          hourly_rate: 75000,
          effective_from: '2026-01-01',
          effective_until: null,
        },
      ];

      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8, 'task-normal')],
        breaks: [],
        rate_overrides: rateOverrides,
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.hourly_pay).toBe(8 * 50000); // 400,000 VND (base rate)
    });

    it('should respect effective date ranges for rate overrides', () => {
      const rateOverrides: RateOverride[] = [
        {
          task_id: 'task-1',
          hourly_rate: 60000,
          effective_from: '2026-01-01',
          effective_until: '2026-01-15', // Expires mid-month
        },
      ];

      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [
          createSession('session-1', '2026-01-08', 8, 'task-1'), // Thursday, within range
        ],
        breaks: [],
        rate_overrides: rateOverrides,
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.hourly_pay).toBe(8 * 60000); // Uses override rate
    });
  });

  describe('Benefits', () => {
    it('should add recurring benefits to gross pay', () => {
      const benefits: Benefit[] = [
        {
          benefit_type: 'meal_allowance',
          name: 'Meal Allowance',
          amount: 500000,
          is_recurring: true,
        },
        {
          benefit_type: 'transport_allowance',
          name: 'Transport Allowance',
          amount: 300000,
          is_recurring: true,
        },
      ];

      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8)],
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits,
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.benefits_total).toBe(800000); // 500k + 300k
      expect(result.gross_pay).toBeGreaterThanOrEqual(
        result.hourly_pay + result.benefits_total
      );
    });

    it('should add one-time bonuses separately', () => {
      const benefits: Benefit[] = [
        {
          benefit_type: 'performance_bonus',
          name: 'Q1 Performance Bonus',
          amount: 2000000,
          is_recurring: false,
        },
      ];

      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8)],
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits,
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.benefits_total).toBe(0); // Not recurring
      expect(result.bonuses_total).toBe(2000000);
      expect(result.gross_pay).toBeGreaterThanOrEqual(
        result.hourly_pay + result.bonuses_total
      );
    });
  });

  describe('Vietnamese Social Insurance Deductions', () => {
    it('should calculate BHXH, BHYT, BHTN deductions', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8)],
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: {
          ...DEFAULT_COMPENSATION,
          insurance_salary: 10000000, // 10M VND
          has_social_insurance: true,
        },
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      // Should have employee deductions
      expect(result.employee_deductions).toBeDefined();
      expect(result.employee_deductions.bhxh).toBeGreaterThan(0);
      expect(result.employee_deductions.bhyt).toBeGreaterThan(0);
      expect(result.employee_deductions.bhtn).toBeGreaterThan(0);

      // Should have company deductions
      expect(result.company_deductions).toBeDefined();
      expect(result.company_deductions.bhxh).toBeGreaterThan(0);
      expect(result.company_deductions.bhyt).toBeGreaterThan(0);

      // Net pay should be gross - deductions
      expect(result.net_pay).toBe(result.gross_pay - result.deductions_total);
    });

    it('should not deduct insurance if has_social_insurance is false', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 8)],
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: {
          ...DEFAULT_COMPENSATION,
          has_social_insurance: false,
        },
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.deductions_total).toBe(0);
      expect(result.net_pay).toBe(result.gross_pay);
    });
  });

  describe('Complex Multi-Day Scenarios', () => {
    it('should handle mixed weekday, weekend, and holiday work', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [
          createSession('session-1', '2026-01-05', 8), // Monday - regular
          createSession('session-2', '2026-01-06', 10), // Tuesday - with OT
          createSession('session-3', '2026-01-10', 6), // Saturday - weekend
          createSession('session-4', '2026-02-17', 8), // Tết - holiday
        ],
        breaks: [],
        rate_overrides: [],
        holidays: VIETNAMESE_HOLIDAYS,
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-02-28',
      };

      const result = calculatePayroll(input);

      // Monday: 8 regular
      // Tuesday: 8 regular + 2 OT (1.5x)
      // Saturday: 6 OT (2.0x)
      // Tết: 8 OT (3.0x)
      expect(result.regular_hours).toBe(16); // Mon + Tue
      expect(result.overtime_hours).toBe(16); // 2 + 6 + 8
      expect(result.daily_breakdown).toHaveLength(4);
    });

    it('should aggregate hours correctly across multiple weeks', () => {
      const sessions = [];
      // Create 4 weeks of work (Mon-Fri, 8 hours each)
      for (let week = 0; week < 4; week++) {
        for (let day = 0; day < 5; day++) {
          const date = new Date(Date.UTC(2026, 0, 5 + week * 7 + day)); // Start Jan 5 (Monday) UTC
          const dateStr = date.toISOString().split('T')[0]!; // Non-null assertion safe here
          sessions.push(createSession(`session-${week}-${day}`, dateStr, 8));
        }
      }

      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions,
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      // 4 weeks * 5 days * 8 hours = 160 regular hours
      expect(result.regular_hours).toBe(160);
      expect(result.overtime_hours).toBe(0);
      expect(result.hourly_pay).toBe(160 * 50000); // 8,000,000 VND
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero sessions gracefully', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [],
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(0);
      expect(result.overtime_hours).toBe(0);
      expect(result.hourly_pay).toBe(0);
      expect(result.overtime_pay).toBe(0);
    });

    it('should handle breaks longer than session duration', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 4)],
        breaks: [createBreak('session-1', 300)], // 5 hours (more than session)
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      // Should not go negative
      expect(result.regular_hours).toBe(0);
      expect(result.hourly_pay).toBe(0);
    });

    it('should handle very small session durations', () => {
      const input: PayrollCalculationInput = {
        user_id: 'user-1',
        contract_id: 'contract-1',
        sessions: [createSession('session-1', '2026-01-05', 0.25)], // 15 minutes
        breaks: [],
        rate_overrides: [],
        holidays: [],
        compensation: DEFAULT_COMPENSATION,
        benefits: [],
        period_start: '2026-01-01',
        period_end: '2026-01-31',
      };

      const result = calculatePayroll(input);

      expect(result.regular_hours).toBe(0.25);
      expect(result.hourly_pay).toBe(0.25 * 50000); // 12,500 VND
    });
  });
});
