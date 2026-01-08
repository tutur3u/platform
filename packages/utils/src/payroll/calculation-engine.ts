import { calculateVnPayroll, type PayrollInput } from './vietnam';

// ==================== TYPES ====================

export interface TimeSession {
  id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  task_id?: string | null;
  date: string; // YYYY-MM-DD
}

export interface BreakRecord {
  session_id: string;
  break_duration_seconds: number;
}

export interface RateOverride {
  task_id?: string | null;
  project_id?: string | null;
  board_id?: string | null;
  hourly_rate: number;
  effective_from: string;
  effective_until?: string | null;
}

export interface Holiday {
  holiday_date: string;
  overtime_multiplier: number;
  name: string;
}

export interface UserCompensation {
  base_hourly_rate: number;
  overtime_threshold_daily_hours: number;
  overtime_multiplier_daily: number;
  overtime_multiplier_weekend: number;
  overtime_multiplier_holiday: number;
  insurance_salary: number;
  gross_salary: number;
  region_min_wage: number;
  base_salary: number;
  is_union_member: boolean;
  has_social_insurance: boolean;
}

export interface Benefit {
  benefit_type: string;
  name: string;
  amount: number;
  is_recurring: boolean;
}

export interface PayrollCalculationInput {
  user_id: string;
  contract_id: string;
  sessions: TimeSession[];
  breaks: BreakRecord[];
  rate_overrides: RateOverride[];
  holidays: Holiday[];
  compensation: UserCompensation;
  benefits: Benefit[];
  period_start: string;
  period_end: string;
}

export interface DailyCalculation {
  date: string;
  regular_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  regular_pay: number;
  overtime_pay: number;
  overtime_multiplier: number; // 1.5, 2.0, or 3.0
  is_weekend: boolean;
  is_holiday: boolean;
  holiday_name?: string;
}

export interface PayrollCalculationResult {
  user_id: string;
  contract_id: string;
  regular_hours: number;
  overtime_hours: number;
  hourly_rate: number; // Average/base rate
  base_pay: number; // For salaried employees
  hourly_pay: number; // Regular hourly pay
  overtime_pay: number; // Overtime pay
  benefits_total: number;
  bonuses_total: number;
  gross_pay: number;
  deductions_total: number;
  net_pay: number;
  daily_breakdown: DailyCalculation[];
  adjustments: Array<{ description: string; amount: number }>;
  company_deductions?: any; // Vietnamese social insurance (company portion)
  employee_deductions?: any; // Vietnamese social insurance (employee portion)
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Find holiday for a specific date
 */
function getHolidayForDate(date: string, holidays: Holiday[]): Holiday | null {
  return holidays.find((h) => h.holiday_date === date) || null;
}

/**
 * Get applicable hourly rate for a session
 * Priority: task_id > project_id > board_id > base rate
 */
function getApplicableRate(
  session: TimeSession,
  baseRate: number,
  overrides: RateOverride[],
  calculationDate: string
): number {
  if (!session.task_id || overrides.length === 0) {
    return baseRate;
  }

  const checkDate = new Date(calculationDate);

  // Filter overrides that are effective for this date
  const validOverrides = overrides.filter((override) => {
    const effectiveFrom = new Date(override.effective_from);
    const effectiveUntil = override.effective_until
      ? new Date(override.effective_until)
      : new Date('2099-12-31');
    return checkDate >= effectiveFrom && checkDate <= effectiveUntil;
  });

  // Priority 1: Exact task match
  const taskOverride = validOverrides.find(
    (o) => o.task_id === session.task_id
  );
  if (taskOverride) {
    return taskOverride.hourly_rate;
  }

  // Priority 2: Project match (requires task's project_id - not implemented yet)
  // TODO: Fetch task's project_id and match against project_id overrides

  // Priority 3: Board match (requires task's board_id - not implemented yet)
  // TODO: Fetch task's board_id and match against board_id overrides

  // Fallback to base rate
  return baseRate;
}

/**
 * Calculate net session duration after subtracting breaks
 */
function calculateNetSessionDuration(
  session: TimeSession,
  breaks: BreakRecord[]
): number {
  const sessionBreaks = breaks.filter((b) => b.session_id === session.id);
  const totalBreakSeconds = sessionBreaks.reduce(
    (sum, b) => sum + b.break_duration_seconds,
    0
  );
  return Math.max(0, session.duration_seconds - totalBreakSeconds);
}

/**
 * Group sessions by date
 */
function groupSessionsByDate(
  sessions: TimeSession[]
): Record<string, TimeSession[]> {
  return sessions.reduce(
    (acc, session) => {
      if (!acc[session.date]) {
        acc[session.date] = [];
      }
      acc[session.date]!.push(session); // Non-null assertion safe after above check
      return acc;
    },
    {} as Record<string, TimeSession[]>
  );
}

// ==================== MAIN CALCULATION ENGINE ====================

/**
 * Calculate payroll for a single user
 * Integrates time sessions, breaks, rate overrides, holidays, benefits, and deductions
 */
export function calculatePayroll(
  input: PayrollCalculationInput
): PayrollCalculationResult {
  const {
    user_id,
    contract_id,
    sessions,
    breaks,
    rate_overrides,
    holidays,
    compensation,
    benefits,
  } = input;

  // Group sessions by date
  const sessionsByDate = groupSessionsByDate(sessions);

  const dailyBreakdown: DailyCalculation[] = [];
  let totalRegularHours = 0;
  let totalOvertimeHours = 0;
  let totalHourlyPay = 0;
  let totalOvertimePay = 0;

  // Calculate for each day
  for (const [date, daySessions] of Object.entries(sessionsByDate)) {
    const isWeekendDay = isWeekend(date);
    const holiday = getHolidayForDate(date, holidays);
    const isHolidayDay = holiday !== null;

    // Calculate total net hours for this day (after subtracting breaks)
    let dayTotalSeconds = 0;
    for (const session of daySessions) {
      dayTotalSeconds += calculateNetSessionDuration(session, breaks);
    }

    const dayTotalHours = dayTotalSeconds / 3600;
    const thresholdHours = compensation.overtime_threshold_daily_hours;

    let regularHours = 0;
    let overtimeHours = 0;
    let overtimeMultiplier = 1.0;

    // Determine overtime classification
    if (isHolidayDay && holiday) {
      // All hours on holidays count as overtime with holiday multiplier
      overtimeHours = dayTotalHours;
      overtimeMultiplier = holiday.overtime_multiplier;
    } else if (isWeekendDay) {
      // All hours on weekends count as overtime with weekend multiplier
      overtimeHours = dayTotalHours;
      overtimeMultiplier = compensation.overtime_multiplier_weekend;
    } else {
      // Weekday: regular hours up to threshold, overtime after
      regularHours = Math.min(dayTotalHours, thresholdHours);
      overtimeHours = Math.max(0, dayTotalHours - thresholdHours);
      overtimeMultiplier = compensation.overtime_multiplier_daily;
    }

    // Get applicable rate for this day's sessions
    // Note: Using first session's task for rate lookup (simplified)
    const firstSession = daySessions[0];
    if (!firstSession) continue; // Skip if no sessions (shouldn't happen)

    const hourlyRate = getApplicableRate(
      firstSession,
      compensation.base_hourly_rate,
      rate_overrides,
      date
    );

    const regularPay = regularHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * overtimeMultiplier;

    dailyBreakdown.push({
      date,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      hourly_rate: hourlyRate,
      regular_pay: regularPay,
      overtime_pay: overtimePay,
      overtime_multiplier: overtimeMultiplier,
      is_weekend: isWeekendDay,
      is_holiday: isHolidayDay,
      holiday_name: holiday?.name,
    });

    totalRegularHours += regularHours;
    totalOvertimeHours += overtimeHours;
    totalHourlyPay += regularPay;
    totalOvertimePay += overtimePay;
  }

  // Calculate benefits
  const benefitsTotal = benefits
    .filter((b) => b.is_recurring)
    .reduce((sum, b) => sum + b.amount, 0);

  const bonusesTotal = benefits
    .filter((b) => !b.is_recurring)
    .reduce((sum, b) => sum + b.amount, 0);

  // Base pay is 0 for hourly workers, would be monthly/annual salary for salaried
  const basePay = 0;
  const grossPay =
    basePay + totalHourlyPay + totalOvertimePay + benefitsTotal + bonusesTotal;

  // Calculate Vietnamese social insurance deductions
  const payrollInput: PayrollInput = {
    insurance_salary: compensation.insurance_salary,
    gross_salary: grossPay,
    region_min_wage: compensation.region_min_wage,
    base_salary: compensation.base_salary,
    is_union_member: compensation.is_union_member,
    has_social_insurance: compensation.has_social_insurance,
  };

  const deductions = calculateVnPayroll(payrollInput);
  const deductionsTotal = deductions.employee.total;
  const netPay = deductions.net_salary;

  return {
    user_id,
    contract_id,
    regular_hours: totalRegularHours,
    overtime_hours: totalOvertimeHours,
    hourly_rate: compensation.base_hourly_rate,
    base_pay: basePay,
    hourly_pay: totalHourlyPay,
    overtime_pay: totalOvertimePay,
    benefits_total: benefitsTotal,
    bonuses_total: bonusesTotal,
    gross_pay: grossPay,
    deductions_total: deductionsTotal,
    net_pay: netPay,
    daily_breakdown: dailyBreakdown,
    adjustments: [],
    company_deductions: deductions.company,
    employee_deductions: deductions.employee,
  };
}
