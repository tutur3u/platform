import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  capacityParamsSchema,
  capacityRulePatchSchema,
  loadCapacityRules,
  replaceSelectors,
  requireCapacityAccess,
  rulePayload,
  TASK_CAPACITY_RULE_APP_SESSION_AUTH,
  validateSelectors,
} from '../_lib';

const paramsSchema = capacityParamsSchema.extend({ ruleId: z.guid() });

export const PATCH = withSessionAuth<{
  wsId: string;
  boardId: string;
  ruleId: string;
}>(
  async (request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const body = capacityRulePatchSchema.parse(await request.json());
      const manager = await requireCapacityAccess({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
        write: true,
      });
      if ('error' in manager) return manager.error;
      const current = await (manager.sbAdmin as any)
        .from('task_capacity_rules')
        .select('enabled')
        .eq('id', params.ruleId)
        .eq('board_id', manager.boardId)
        .maybeSingle();
      if (current.error) throw current.error;
      if (!current.data)
        return NextResponse.json(
          { error: 'Capacity rule not found' },
          { status: 404 }
        );
      const selectorError = await validateSelectors(manager, body);
      if (selectorError) return selectorError;
      await replaceSelectors(manager, params.ruleId, body);
      const update = await (manager.sbAdmin as any)
        .from('task_capacity_rules')
        .update({
          ...rulePayload(body, user.id),
          enabled: body.enabled ?? current.data.enabled,
          disabled_reason: body.enabled === false ? 'manually_disabled' : null,
        })
        .eq('id', params.ruleId)
        .eq('board_id', manager.boardId)
        .select('id')
        .maybeSingle();
      if (update.error) throw update.error;
      if (!update.data)
        return NextResponse.json(
          { error: 'Capacity rule not found' },
          { status: 404 }
        );
      const { data, error } = await loadCapacityRules(manager);
      if (error) throw error;
      return NextResponse.json({
        rule: data?.find(
          (candidate: { id: string }) => candidate.id === params.ruleId
        ),
      });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return NextResponse.json(
          { error: 'Invalid capacity rule payload' },
          { status: 400 }
        );
      return NextResponse.json(
        { error: 'Failed to update capacity rule' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_CAPACITY_RULE_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<{
  wsId: string;
  boardId: string;
  ruleId: string;
}>(
  async (_request, { supabase, user }, rawParams) => {
    try {
      const params = paramsSchema.parse(rawParams);
      const manager = await requireCapacityAccess({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
        write: true,
      });
      if ('error' in manager) return manager.error;
      const result = await (manager.sbAdmin as any)
        .from('task_capacity_rules')
        .delete()
        .eq('id', params.ruleId)
        .eq('board_id', manager.boardId)
        .select('id')
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data)
        return NextResponse.json(
          { error: 'Capacity rule not found' },
          { status: 404 }
        );
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError)
        return NextResponse.json(
          { error: 'Invalid capacity rule ID' },
          { status: 400 }
        );
      return NextResponse.json(
        { error: 'Failed to delete capacity rule' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_CAPACITY_RULE_APP_SESSION_AUTH }
);
