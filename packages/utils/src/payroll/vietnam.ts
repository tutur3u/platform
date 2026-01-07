export interface InsuranceConfig {
  bhxh_company_rate: number;
  bhxh_employee_rate: number;
  bhyt_company_rate: number;
  bhyt_employee_rate: number;
  bhtn_company_rate: number;
  bhtn_employee_rate: number;
  union_company_rate: number;
  union_employee_rate: number;
  base_salary_cap_multiplier: number; // For BHXH/BHYT (20x)
  min_wage_cap_multiplier: number; // For BHTN (20x)
}

// Defaults based on 2024 regulations
export const VN_INSURANCE_RATES: InsuranceConfig = {
  bhxh_company_rate: 0.175,
  bhxh_employee_rate: 0.08,
  bhyt_company_rate: 0.03,
  bhyt_employee_rate: 0.015,
  bhtn_company_rate: 0.01,
  bhtn_employee_rate: 0.01,
  union_company_rate: 0.02,
  union_employee_rate: 0.01, // Often voluntary or capped
  base_salary_cap_multiplier: 20,
  min_wage_cap_multiplier: 20,
};

export interface PayrollInput {
  insurance_salary: number; // Salary used for insurance (often distinct from gross)
  gross_salary: number; // Actual gross salary (base + allowances)
  region_min_wage: number; // Minimum wage for the region (Region I, II, III, IV)
  base_salary: number; // National base salary (Lương cơ sở)
  is_union_member: boolean;
  has_social_insurance: boolean;
}

export interface PayrollDeductions {
  company: {
    bhxh: number;
    bhyt: number;
    bhtn: number;
    union: number;
    total: number;
  };
  employee: {
    bhxh: number;
    bhyt: number;
    bhtn: number;
    union: number;
    total: number;
  };
  net_salary: number; // Simple net before tax (PIT not calculated here yet)
}

export function calculateVnPayroll(
  input: PayrollInput,
  config: InsuranceConfig = VN_INSURANCE_RATES
): PayrollDeductions {
  const {
    insurance_salary,
    gross_salary,
    region_min_wage,
    base_salary,
    is_union_member,
    has_social_insurance,
  } = input;

  if (!has_social_insurance) {
    return {
      company: { bhxh: 0, bhyt: 0, bhtn: 0, union: 0, total: 0 },
      employee: { bhxh: 0, bhyt: 0, bhtn: 0, union: 0, total: 0 },
      net_salary: gross_salary,
    };
  }

  // 1. Calculate Caps
  const socialHealthCap = base_salary * config.base_salary_cap_multiplier;
  const unemploymentCap = region_min_wage * config.min_wage_cap_multiplier;

  // 2. Determine Salary for Calculation
  const socialHealthBasis = Math.min(insurance_salary, socialHealthCap);
  const unemploymentBasis = Math.min(insurance_salary, unemploymentCap);

  // Union fee basis (usually capped on insurance salary but practice varies, often same as socialHealthBasis)
  const unionBasis = socialHealthBasis;

  // 3. Calculate Company Contributions
  const company = {
    bhxh: socialHealthBasis * config.bhxh_company_rate,
    bhyt: socialHealthBasis * config.bhyt_company_rate,
    bhtn: unemploymentBasis * config.bhtn_company_rate,
    union: is_union_member ? unionBasis * config.union_company_rate : 0,
    total: 0,
  };
  company.total = company.bhxh + company.bhyt + company.bhtn + company.union;

  // 4. Calculate Employee Deductions
  const employee = {
    bhxh: socialHealthBasis * config.bhxh_employee_rate,
    bhyt: socialHealthBasis * config.bhyt_employee_rate,
    bhtn: unemploymentBasis * config.bhtn_employee_rate,
    union: is_union_member ? unionBasis * config.union_employee_rate : 0, // Simplified, often fixed amount or capped differently
    total: 0,
  };
  employee.total =
    employee.bhxh + employee.bhyt + employee.bhtn + employee.union;

  // 5. Net Salary (Before PIT)
  const net_salary = gross_salary - employee.total;

  return {
    company,
    employee,
    net_salary,
  };
}
