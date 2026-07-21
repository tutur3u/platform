import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAiCreditsAdminRequest } from '../access';

export async function GET() {
  await connection();

  try {
    const auth = await authorizeAiCreditsAdminRequest();
    if (!auth.ok) return auth.response;

    const { sbAdmin } = auth;
    const { data, error } = await sbAdmin
      .from('ai_credit_feature_access')
      .select('*')
      .order('tier')
      .order('feature');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch feature access' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in features GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  id: z.guid(),
  enabled: z.boolean().optional(),
  max_requests_per_day: z.number().nullable().optional(),
});

export async function PUT(req: Request) {
  try {
    const auth = await authorizeAiCreditsAdminRequest();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const { sbAdmin } = auth;

    const { data, error } = await sbAdmin
      .from('ai_credit_feature_access')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update feature access' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in features PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
