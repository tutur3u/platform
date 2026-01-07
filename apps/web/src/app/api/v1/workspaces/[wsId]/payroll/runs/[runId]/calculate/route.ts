import { createClient } from '@tuturuuu/supabase/next/server';
import {
  calculatePayroll,
  type PayrollCalculationInput,
  type TimeSession,
  type BreakRecord,
} from '@tuturuuu/utils/payroll/calculation-engine';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; runId: string }> }
) {
  const { wsId, runId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_payroll')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  // 1. Fetch the payroll run
  const { data: payrollRun, error: runError } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', runId)
    .eq('ws_id', normalizedWsId)
    .single();

  if (runError || !payrollRun) {
    return NextResponse.json(
      { error: 'Payroll run not found' },
      { status: 404 }
    );
  }

  // Check if run is in draft status
  if (payrollRun.status !== 'draft') {
    return NextResponse.json(
      { error: 'Payroll run must be in draft status to calculate' },
      { status: 400 }
    );
  }

  const periodStart = payrollRun.period_start;
  const periodEnd = payrollRun.period_end;

  try {
    // 2. Fetch all active contracts for the period
    const { data: contracts, error: contractsError } = await supabase
      .from('workforce_contracts')
      .select('*, workforce_compensation(*), workforce_benefits(*)')
      .eq('ws_id', normalizedWsId)
      .eq('employment_status', 'active')
      .lte('start_date', periodEnd)
      .or(`end_date.is.null,end_date.gte.${periodStart}`);

    if (contractsError) {
      console.error('Error fetching contracts:', contractsError);
      return NextResponse.json(
        { error: 'Failed to fetch contracts' },
        { status: 500 }
      );
    }

    // 3. Fetch holidays for the period
    const { data: holidays, error: holidaysError } = await supabase
      .from('workspace_holidays')
      .select('*')
      .eq('ws_id', normalizedWsId)
      .gte('holiday_date', periodStart)
      .lte('holiday_date', periodEnd);

    if (holidaysError) {
      console.error('Error fetching holidays:', holidaysError);
      return NextResponse.json(
        { error: 'Failed to fetch holidays' },
        { status: 500 }
      );
    }

    const payrollItems = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    // 4. Process each contract
    for (const contract of contracts || []) {
      const userId = contract.user_id;
      const contractId = contract.id;

      // 4a. Fetch approved time sessions for this user
      const { data: sessions, error: sessionsError } = await supabase
        .from('time_tracking_sessions')
        .select('*')
        .eq('ws_id', normalizedWsId)
        .eq('user_id', userId)
        .eq('pending_approval', false)
        .gte('start_time', periodStart)
        .lte('start_time', periodEnd)
        .not('end_time', 'is', null);

      if (sessionsError) {
        console.error(
          `Error fetching sessions for user ${userId}:`,
          sessionsError
        );
        continue;
      }

      if (!sessions || sessions.length === 0) {
        // No sessions for this user - skip
        continue;
      }

      // Transform sessions to the format expected by calculation engine
      const timeSessions: TimeSession[] = sessions.map((s) => ({
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        duration_seconds: s.duration_seconds || 0,
        task_id: s.task_id,
        date: new Date(s.start_time).toISOString().split('T')[0],
      }));

      // 4b. Fetch breaks for these sessions
      const sessionIds = sessions.map((s) => s.id);
      const { data: breaks, error: breaksError } = await supabase
        .from('time_tracking_breaks')
        .select('*')
        .in('session_id', sessionIds);

      if (breaksError) {
        console.error(`Error fetching breaks for user ${userId}:`, breaksError);
      }

      const breakRecords: BreakRecord[] = (breaks || []).map((b) => ({
        session_id: b.session_id,
        break_duration_seconds: b.break_end && b.break_start
          ? (new Date(b.break_end).getTime() -
              new Date(b.break_start).getTime()) /
            1000
          : 0,
      }));

      // 4c. Fetch rate overrides for this user
      const { data: rateOverrides, error: rateOverridesError } = await supabase
        .from('task_rate_overrides')
        .select('*')
        .eq('ws_id', normalizedWsId)
        .eq('user_id', userId)
        .lte('effective_from', periodEnd)
        .or(`effective_until.is.null,effective_until.gte.${periodStart}`);

      if (rateOverridesError) {
        console.error(
          `Error fetching rate overrides for user ${userId}:`,
          rateOverridesError
        );
      }

      // 4d. Get compensation details (use the first active compensation record)
      const compensation = (contract.workforce_compensation || [])[0];
      if (!compensation) {
        console.warn(`No compensation found for contract ${contractId}`);
        continue;
      }

      // 4e. Get benefits
      const benefits = (contract.workforce_benefits || []).map((b: any) => ({
        benefit_type: b.benefit_type,
        name: b.name,
        amount: b.amount,
        is_recurring: b.is_recurring,
      }));

      // 5. Calculate payroll for this user
      const calculationInput: PayrollCalculationInput = {
        user_id: userId,
        contract_id: contractId,
        sessions: timeSessions,
        breaks: breakRecords,
        rate_overrides: (rateOverrides || []).map((ro) => ({
          task_id: ro.task_id,
          project_id: ro.project_id,
          board_id: ro.board_id,
          hourly_rate: ro.hourly_rate,
          effective_from: ro.effective_from,
          effective_until: ro.effective_until,
        })),
        holidays: (holidays || []).map((h) => ({
          holiday_date: h.holiday_date,
          overtime_multiplier: h.overtime_multiplier,
          name: h.name,
        })),
        compensation: {
          base_hourly_rate: compensation.base_hourly_rate || 0,
          overtime_threshold_daily_hours:
            compensation.overtime_threshold_daily_hours || 8,
          overtime_multiplier_daily:
            compensation.overtime_multiplier_daily || 1.5,
          overtime_multiplier_weekend:
            compensation.overtime_multiplier_weekend || 2.0,
          overtime_multiplier_holiday:
            compensation.overtime_multiplier_holiday || 3.0,
          insurance_salary: compensation.insurance_salary || 0,
          gross_salary: compensation.base_salary_monthly || 0,
          region_min_wage: 4680000, // Default for Vietnam (2024)
          base_salary: 2340000, // Vietnam base salary (2024)
          is_union_member: false,
          has_social_insurance: true,
        },
        benefits,
        period_start: periodStart,
        period_end: periodEnd,
      };

      const result = calculatePayroll(calculationInput);

      // 6. Prepare payroll item for insertion
      payrollItems.push({
        ws_id: normalizedWsId,
        run_id: runId,
        user_id: userId,
        contract_id: contractId,
        regular_hours: result.regular_hours,
        overtime_hours: result.overtime_hours,
        hourly_rate: result.hourly_rate,
        base_pay: result.base_pay,
        hourly_pay: result.hourly_pay,
        overtime_pay: result.overtime_pay,
        benefits_total: result.benefits_total,
        bonuses_total: result.bonuses_total,
        gross_pay: result.gross_pay,
        deductions_total: result.deductions_total,
        net_pay: result.net_pay,
        adjustments: result.adjustments,
        company_deductions: result.company_deductions,
        employee_deductions: result.employee_deductions,
      });

      totalGross += result.gross_pay;
      totalDeductions += result.deductions_total;
      totalNet += result.net_pay;
    }

    // 7. Delete any existing payroll items for this run (in case of recalculation)
    await supabase
      .from('payroll_run_items')
      .delete()
      .eq('run_id', runId)
      .eq('ws_id', normalizedWsId);

    // 8. Insert new payroll items
    if (payrollItems.length > 0) {
      const { error: insertError } = await supabase
        .from('payroll_run_items')
        .insert(payrollItems);

      if (insertError) {
        console.error('Error inserting payroll items:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert payroll items' },
          { status: 500 }
        );
      }
    }

    // 9. Update payroll run totals and status
    const { data: updatedRun, error: updateError } = await supabase
      .from('payroll_runs')
      .update({
        status: 'pending_approval',
        total_gross_amount: totalGross,
        total_deductions: totalDeductions,
        total_net_amount: totalNet,
      })
      .eq('id', runId)
      .eq('ws_id', normalizedWsId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating payroll run:', updateError);
      return NextResponse.json(
        { error: 'Failed to update payroll run' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payroll_run: updatedRun,
      items_count: payrollItems.length,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
    });
  } catch (error) {
    console.error('Payroll calculation error:', error);
    return NextResponse.json(
      { error: 'Internal server error during calculation' },
      { status: 500 }
    );
  }
}
