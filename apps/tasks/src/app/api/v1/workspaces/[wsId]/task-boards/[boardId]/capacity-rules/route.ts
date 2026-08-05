import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  capacityParamsSchema,
  capacityRuleSchema,
  loadCapacityRules,
  replaceSelectors,
  requireCapacityAccess,
  rulePayload,
  validateSelectors,
} from './_lib';

export const GET = withSessionAuth<{ wsId: string; boardId: string }>(
  async (_request, { supabase, user }, rawParams) => {
    try {
      const params = capacityParamsSchema.parse(rawParams);
      const manager = await requireCapacityAccess({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
      });
      if ('error' in manager) return manager.error;
      const { data, error } = await loadCapacityRules(manager);
      if (error) throw error;
      return NextResponse.json({ rules: data ?? [] });
    } catch (error) {
      if (error instanceof z.ZodError)
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      console.error('Failed to load task capacity rules', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return NextResponse.json(
        { error: 'Failed to load capacity rules' },
        { status: 500 }
      );
    }
  }
);

export const POST = withSessionAuth<{ wsId: string; boardId: string }>(
  async (request, { supabase, user }, rawParams) => {
    try {
      const params = capacityParamsSchema.parse(rawParams);
      const body = capacityRuleSchema.parse(await request.json());
      const manager = await requireCapacityAccess({
        boardId: params.boardId,
        rawWsId: params.wsId,
        supabase,
        user,
        write: true,
      });
      if ('error' in manager) return manager.error;
      const selectorError = await validateSelectors(manager, body);
      if (selectorError) return selectorError;
      const { data: rule, error } = await (manager.sbAdmin as any)
        .from('task_capacity_rules')
        .insert({
          board_id: manager.boardId,
          created_by: user.id,
          ...rulePayload(body, user.id),
        })
        .select('id')
        .single();
      if (error || !rule) throw error ?? new Error('Rule was not created');
      try {
        await replaceSelectors(manager, rule.id, body);
      } catch (selectorFailure) {
        await (manager.sbAdmin as any)
          .from('task_capacity_rules')
          .delete()
          .eq('id', rule.id);
        throw selectorFailure;
      }
      const { data, error: loadError } = await loadCapacityRules(manager);
      if (loadError) throw loadError;
      return NextResponse.json(
        {
          rule: data?.find(
            (candidate: { id: string }) => candidate.id === rule.id
          ),
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return NextResponse.json(
          {
            error: 'Invalid capacity rule payload',
            issues: error instanceof z.ZodError ? error.issues : undefined,
          },
          { status: 400 }
        );
      console.error('Failed to create task capacity rule', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return NextResponse.json(
        { error: 'Failed to create capacity rule' },
        { status: 500 }
      );
    }
  }
);
