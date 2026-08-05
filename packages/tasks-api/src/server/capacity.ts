import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type DatabaseError = { message?: string; details?: string; detail?: string };

export function parseTaskCapacityViolation(error: unknown) {
  const candidate = (error ?? {}) as DatabaseError;
  if (
    candidate.message !== 'TASK_CAPACITY_EXCEEDED' &&
    !candidate.message?.includes('TASK_CAPACITY_EXCEEDED')
  )
    return null;
  const detail = candidate.details ?? candidate.detail;
  if (!detail) return null;
  try {
    const violation = JSON.parse(detail) as Record<string, unknown>;
    return {
      code: 'TASK_CAPACITY_EXCEEDED' as const,
      violations: [violation],
    };
  } catch {
    return { code: 'TASK_CAPACITY_EXCEEDED' as const, violations: [] };
  }
}

export async function loadTaskCapacityWarnings(
  sbAdmin: TypedSupabaseClient,
  boardId: string | null | undefined
) {
  if (!boardId) return [];
  try {
    const result = await (sbAdmin as any).rpc?.('get_task_capacity_rules', {
      p_board_id: boardId,
    });
    if (!result || result.error) return [];
    const { data } = result;
    return ((data ?? []) as Array<Record<string, unknown>>)
      .filter(
        (rule) =>
          rule.enabled === true &&
          rule.enforcement === 'soft' &&
          Number(rule.current_value) > Number(rule.limit_value)
      )
      .map((rule) => ({
        enforcement: 'soft' as const,
        ruleId: rule.id,
        ruleName: rule.name,
        metric: rule.metric,
        currentValue: Number(rule.current_value),
        attemptedValue: Number(rule.current_value),
        limit: Number(rule.limit_value),
      }));
  } catch {
    // Capacity warnings are additive metadata; enforcement already happened in
    // PostgreSQL, so a summary read must never turn a successful mutation into
    // a 500 response.
    return [];
  }
}
