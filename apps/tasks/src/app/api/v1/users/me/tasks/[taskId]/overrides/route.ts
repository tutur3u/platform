import {
  MAX_COLOR_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const upsertSchema = z.object({
  self_managed: z.boolean().optional(),
  completed_at: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  priority_override: z
    .enum(['low', 'normal', 'high', 'critical'])
    .nullable()
    .optional(),
  due_date_override: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  estimation_override: z.number().int().min(0).max(8).nullable().optional(),
  personally_unassigned: z.boolean().optional(),
  notes: z.string().max(MAX_MEDIUM_TEXT_LENGTH).nullable().optional(),
});

export const GET = withSessionAuth<{ taskId: string }>(
  async (_req, { user, supabase }, { taskId }) => {
    try {
      if (!validate(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const { data, error } = await (supabase as any)
        .from('task_user_overrides')
        .select('*')
        .eq('task_id', taskId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching task override:', error);
        return NextResponse.json(
          { error: 'Failed to fetch override' },
          { status: 500 }
        );
      }

      return NextResponse.json({ data: data ?? null });
    } catch (error) {
      console.error('Error in task overrides GET:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 5, swr: 10 } }
);

export const PUT = withSessionAuth<{ taskId: string }>(
  async (req, { user, supabase }, { taskId }) => {
    try {
      if (!validate(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const body = await req.json();
      const parsed = upsertSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { data, error } = await (supabase as any)
        .from('task_user_overrides')
        .upsert(
          {
            task_id: taskId,
            user_id: user.id,
            ...parsed.data,
          },
          { onConflict: 'task_id,user_id' }
        )
        .select()
        .single();

      if (error) {
        console.error('Error upserting task override:', error);
        return NextResponse.json(
          { error: 'Failed to save override' },
          { status: 500 }
        );
      }

      return NextResponse.json({ data });
    } catch (error) {
      console.error('Error in task overrides PUT:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withSessionAuth<{ taskId: string }>(
  async (_req, { user, supabase }, { taskId }) => {
    try {
      if (!validate(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const { error } = await (supabase as any)
        .from('task_user_overrides')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting task override:', error);
        return NextResponse.json(
          { error: 'Failed to delete override' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Error in task overrides DELETE:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
