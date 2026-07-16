import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '@tuturuuu/ai/credits/resolve-plan-model';
import type { CreditCheckResult } from '@tuturuuu/ai/credits/types';
import { withAiMemory } from '@tuturuuu/ai/memory';
import {
  TASK_PROGRESS_AI_CATCHUPS_CONFIG_ID,
  TASK_PROGRESS_CATCHUP_CADENCE_CONFIG_ID,
} from '@tuturuuu/tasks-api/progress/preferences';
import { gateway, generateObject, NoObjectGeneratedError } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isAutonomousTaskMetric,
  loadAutonomousTaskProgressEntries,
} from '../_autonomous';
import { buildDeterministicCatchup } from '../_deterministic-catchup';
import { buildTaskProgressInsights } from '../_insights';
import {
  ensureDefaultTaskProgressMetrics,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_METRIC_SELECT,
  type TaskProgressRouteAuth,
  type TaskProgressRouteContext,
} from '../_utils';

const AI_FEATURE = 'task_journal';
const CACHE_CONFIG_PREFIX = 'TASK_PROGRESS_AI_CATCHUP_CACHE';
const requestSchema = z.object({
  force: z.boolean().optional().default(false),
  locale: z.string().trim().min(2).max(35).optional().default('en'),
  period: z.enum(['weekly', 'monthly']),
});
const catchupSchema = z.object({
  executiveSummary: z.string().min(1).max(600),
  highlights: z.array(z.string().min(1).max(180)).max(4),
  watchouts: z.array(z.string().min(1).max(180)).max(3),
  nextActions: z.array(z.string().min(1).max(180)).max(4),
});

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPeriod(period: 'weekly' | 'monthly') {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const start = new Date(today);
  if (period === 'weekly') {
    const weekday = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - weekday + 1);
  } else {
    start.setUTCDate(1);
  }
  return {
    end: formatDate(today),
    key: `${period}:${formatDate(start)}`,
    start: formatDate(start),
  };
}

async function getConfig(auth: TaskProgressRouteAuth, id: string) {
  const { data, error } = await (auth.sbAdmin as any)
    .from('user_workspace_configs')
    .select('value')
    .eq('user_id', auth.user.id)
    .eq('ws_id', auth.wsId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.value as string | null | undefined;
}

async function saveCache(
  auth: TaskProgressRouteAuth,
  id: string,
  value: unknown
) {
  const { error } = await (auth.sbAdmin as any)
    .from('user_workspace_configs')
    .upsert(
      {
        id,
        user_id: auth.user.id,
        value: JSON.stringify(value),
        ws_id: auth.wsId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,ws_id,id' }
    );
  if (error) throw error;
}

function parseCachedCatchup(value: string | null | undefined, key: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { periodKey?: string };
    return parsed.periodKey === key ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = requestSchema.parse(await request.json());
    const [enabled, cadence] = await Promise.all([
      getConfig(auth, TASK_PROGRESS_AI_CATCHUPS_CONFIG_ID),
      getConfig(auth, TASK_PROGRESS_CATCHUP_CADENCE_CONFIG_ID),
    ]);
    if (enabled !== 'true') {
      return NextResponse.json(
        { error: 'AI catch-ups are disabled', code: 'AI_CATCHUPS_DISABLED' },
        { status: 403 }
      );
    }
    if (cadence && cadence !== 'both' && cadence !== body.period) {
      return NextResponse.json(
        {
          error: 'This catch-up cadence is disabled',
          code: 'CADENCE_DISABLED',
        },
        { status: 403 }
      );
    }

    const period = getPeriod(body.period);
    const localeKey = body.locale.toUpperCase().replace(/[^A-Z0-9]/gu, '_');
    const periodKey = `${period.key}:${body.locale}`;
    const cacheId = `${CACHE_CONFIG_PREFIX}_${body.period.toUpperCase()}_${localeKey}`;
    if (!body.force) {
      const cached = parseCachedCatchup(
        await getConfig(auth, cacheId),
        periodKey
      );
      if (cached) {
        return NextResponse.json({ ok: true, cached: true, catchup: cached });
      }
    }

    // Deterministic fallback so the panel never hard-fails when AI is
    // unavailable (disabled, no credits/allocation, or a gateway error).
    const respondDeterministic = (
      daily: Array<{ date: string; value: number }>,
      intelligence: ReturnType<typeof buildTaskProgressInsights>,
      unitLabel: string,
      reason: string
    ) => {
      console.warn('Task progress catch-up: using deterministic fallback', {
        reason,
        wsId: auth.wsId,
      });
      const object = buildDeterministicCatchup({
        daily,
        insights: intelligence.insights,
        period: body.period,
        periods: intelligence.periods,
        unitLabel,
      });
      const catchup = {
        ...object,
        generatedAt: new Date().toISOString(),
        period: body.period,
        periodEnd: period.end,
        periodKey,
        periodStart: period.start,
        source: 'deterministic' as const,
      };
      return NextResponse.json({ ok: true, cached: false, catchup });
    };

    await ensureDefaultTaskProgressMetrics(auth);
    const { data: metric, error: metricError } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .select(TASK_PROGRESS_METRIC_SELECT)
      .eq('ws_id', auth.wsId)
      .eq('unit_kind', 'tasks')
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (metricError) throw metricError;
    if (!metric || !isAutonomousTaskMetric(metric)) {
      return respondDeterministic(
        [],
        buildTaskProgressInsights([]),
        'tasks',
        'no_automatic_metric'
      );
    }
    const unitLabel = String(metric.unit_label ?? 'tasks');

    const entries = (
      await loadAutonomousTaskProgressEntries(auth, metric, {
        from: period.start,
        to: period.end,
      })
    ).filter((entry) => entry.created_by === auth.user.id);
    const byDate = new Map<string, number>();
    for (const entry of entries) {
      byDate.set(
        entry.entry_date,
        (byDate.get(entry.entry_date) ?? 0) + entry.effectiveValue
      );
    }
    const daily = [...byDate.entries()].map(([date, value]) => ({
      date,
      value,
    }));
    const intelligence = buildTaskProgressInsights(daily);

    let modelId: string;
    try {
      modelId = (
        await resolvePlanModel({ capability: 'language', wsId: auth.wsId })
      ).modelId;
    } catch (error) {
      if (error instanceof PlanModelResolutionError) {
        return respondDeterministic(
          daily,
          intelligence,
          unitLabel,
          `plan_model:${error.code}`
        );
      }
      throw error;
    }
    const creditCheck = await checkAiCredits(auth.wsId, modelId, AI_FEATURE, {
      userId: auth.user.id,
    });
    if (!creditCheck.allowed) {
      return respondDeterministic(
        daily,
        intelligence,
        unitLabel,
        `credits:${creditCheck.errorCode ?? 'not_allowed'}`
      );
    }
    const maxOutputTokens = await capMaxOutputTokensByCredits(
      auth.sbAdmin,
      modelId,
      creditCheck.maxOutputTokens ?? null,
      (creditCheck as CreditCheckResult).remainingCredits
    );
    if (maxOutputTokens === null && creditCheck.remainingCredits <= 0) {
      return respondDeterministic(
        daily,
        intelligence,
        unitLabel,
        'credits:exhausted'
      );
    }

    try {
      const { object, usage } = await generateObject({
        model: await withAiMemory({
          customId: `task-progress-catchup-${periodKey}`,
          model: gateway(modelId),
          product: 'tasks',
          source: 'task_progress_catchup',
          surface: 'task_progress_catchup',
          userId: auth.user.id,
          wsId: auth.wsId,
        }),
        schema: catchupSchema,
        prompt: [
          'You are Tuturuuu task intelligence. Write a concise, supportive progress catch-up.',
          'Use only the aggregate facts supplied. Never invent projects, blockers, people, or completed work.',
          'Prioritize useful patterns and specific next actions. Avoid judgmental or productivity-shaming language.',
          `Write in the locale ${body.locale}.`,
          `Period: ${body.period} (${period.start} through ${period.end}).`,
          `Aggregate telemetry JSON: ${JSON.stringify({ daily, ...intelligence })}`,
        ].join('\n'),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
      });
      if (usage) {
        void deductAiCredits({
          feature: AI_FEATURE,
          inputTokens: usage.inputTokens ?? 0,
          modelId,
          outputTokens: usage.outputTokens ?? 0,
          reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
          userId: auth.user.id,
          wsId: auth.wsId,
        }).catch((error) =>
          console.error('Failed to deduct task progress AI credits', {
            error,
            userId: auth.user.id,
            wsId: auth.wsId,
          })
        );
      }
      const catchup = {
        ...object,
        generatedAt: new Date().toISOString(),
        period: body.period,
        periodEnd: period.end,
        periodKey,
        periodStart: period.start,
        source: 'ai' as const,
      };
      await saveCache(auth, cacheId, catchup);
      return NextResponse.json({ ok: true, cached: false, catchup });
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.usage) {
        void deductAiCredits({
          feature: AI_FEATURE,
          inputTokens: error.usage.inputTokens ?? 0,
          modelId,
          outputTokens: error.usage.outputTokens ?? 0,
          reasoningTokens: error.usage.outputTokenDetails?.reasoningTokens ?? 0,
          userId: auth.user.id,
          wsId: auth.wsId,
        }).catch((creditError) =>
          console.error('Failed to deduct task progress AI credits', {
            error: creditError,
            userId: auth.user.id,
            wsId: auth.wsId,
          })
        );
      }
      // AI generation failed (gateway, schema, timeout, …). Log the real cause
      // for debugging, then degrade gracefully instead of erroring the panel.
      console.error('Task progress catch-up AI generation failed', {
        error,
        modelId,
        wsId: auth.wsId,
      });
      return respondDeterministic(
        daily,
        intelligence,
        unitLabel,
        'ai_generation_error'
      );
    }
  } catch (error) {
    console.error('Failed to generate task progress catch-up', {
      error,
      wsId: auth.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to generate task progress catch-up' },
      { status: 500 }
    );
  }
}
