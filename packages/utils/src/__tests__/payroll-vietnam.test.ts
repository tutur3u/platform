import { describe, expect, it } from 'vitest';
import { calculateVnPayroll } from '../payroll/vietnam';

describe('Vietnamese Payroll Calculation', () => {
  // Constants for 2024
  const BASE_SALARY = 2340000; // Lương cơ sở
  const REGION_1_MIN_WAGE = 4960000; // Lương tối thiểu vùng I

  it('should calculate correct deductions for standard salary', () => {
    const salary = 10000000; // 10M VND
    const input = {
      insurance_salary: salary,
      gross_salary: salary,
      region_min_wage: REGION_1_MIN_WAGE,
      base_salary: BASE_SALARY,
      is_union_member: false,
      has_social_insurance: true,
    };

    const result = calculateVnPayroll(input);

    // Employee Deductions
    expect(result.employee.bhxh).toBe(salary * 0.08); // 800,000
    expect(result.employee.bhyt).toBe(salary * 0.015); // 150,000
    expect(result.employee.bhtn).toBe(salary * 0.01); // 100,000
    expect(result.employee.total).toBe(1050000);

    // Company Contributions
    expect(result.company.bhxh).toBe(salary * 0.175); // 1,750,000
    expect(result.company.bhyt).toBe(salary * 0.03); // 300,000
    expect(result.company.bhtn).toBe(salary * 0.01); // 100,000
  });

  it('should cap social/health insurance at 20x base salary', () => {
    const salary = 100000000; // 100M VND (Exceeds 20x base salary of 46.8M)
    const cap = BASE_SALARY * 20; // 46,800,000

    const input = {
      insurance_salary: salary,
      gross_salary: salary,
      region_min_wage: REGION_1_MIN_WAGE,
      base_salary: BASE_SALARY,
      is_union_member: false,
      has_social_insurance: true,
    };

    const result = calculateVnPayroll(input);

    // Should be capped
    expect(result.employee.bhxh).toBe(cap * 0.08);
    expect(result.employee.bhyt).toBe(cap * 0.015);

    // Unemployment insurance capped at 20x min wage (99.2M)
    // 100M > 99.2M, so it should be capped
    const bhtnCap = REGION_1_MIN_WAGE * 20;
    expect(result.employee.bhtn).toBe(bhtnCap * 0.01);
  });

  it('should cap unemployment insurance at 20x region min wage', () => {
    const salary = 120000000; // 120M
    const bhtnCap = REGION_1_MIN_WAGE * 20; // 99,200,000

    const input = {
      insurance_salary: salary,
      gross_salary: salary,
      region_min_wage: REGION_1_MIN_WAGE,
      base_salary: BASE_SALARY,
      is_union_member: false,
      has_social_insurance: true,
    };

    const result = calculateVnPayroll(input);

    expect(result.employee.bhtn).toBe(bhtnCap * 0.01);
    expect(result.company.bhtn).toBe(bhtnCap * 0.01);
  });

  it('should handle union fees when member', () => {
    const salary = 10000000;
    const input = {
      insurance_salary: salary,
      gross_salary: salary,
      region_min_wage: REGION_1_MIN_WAGE,
      base_salary: BASE_SALARY,
      is_union_member: true,
      has_social_insurance: true,
    };

    const result = calculateVnPayroll(input);

    expect(result.company.union).toBe(salary * 0.02);
    expect(result.employee.union).toBe(salary * 0.01);
  });

  it('should return zero deductions if no social insurance', () => {
    const salary = 10000000;
    const input = {
      insurance_salary: salary,
      gross_salary: salary,
      region_min_wage: REGION_1_MIN_WAGE,
      base_salary: BASE_SALARY,
      is_union_member: true,
      has_social_insurance: false,
    };

    const result = calculateVnPayroll(input);

    expect(result.employee.total).toBe(0);
    expect(result.company.total).toBe(0);
    expect(result.net_salary).toBe(salary);
  });
});
