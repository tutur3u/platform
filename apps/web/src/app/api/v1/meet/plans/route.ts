import { createPlan } from '@tuturuuu/apis/meet/actions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createPlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  dates: z.array(z.string().date()).min(1),
  start_time: z.string().min(4).max(32),
  end_time: z.string().min(4).max(32),
  timezone: z.string().min(1).max(255).optional(),
  duration_minutes: z.number().int().min(15).max(1440).multipleOf(15),
  ws_id: z.string().uuid().optional(),
  is_public: z.boolean().optional(),
  where_to_meet: z.boolean().optional(),
  description: z.string().max(5000).optional(),
  agenda_content: z.unknown().optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }
  const parsed = createPlanSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }
  const result = await createPlan(parsed.data);
  if (!result.data) {
    return NextResponse.json(
      { error: result.error ?? 'Unable to create plan' },
      { status: result.error === 'Not authenticated' ? 401 : 400 }
    );
  }
  return NextResponse.json(result.data, { status: 201 });
}
