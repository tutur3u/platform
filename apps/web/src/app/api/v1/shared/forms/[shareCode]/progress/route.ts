import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { formProgressSchema } from '@/features/forms/schema';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const parsed = formProgressSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Invalid progress payload',
        },
        { status: 400 }
      );
    }

    const adminClient = await createAdminClient();
    const { data: shareLink } = await adminClient
      .from('form_share_links')
      .select('id, form_id')
      .eq('code', shareCode)
      .maybeSingle();

    if (!shareLink) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const { error } = await adminClient
      .from('form_sessions')
      .update({
        started_at: new Date().toISOString(),
        last_question_id: parsed.data.lastQuestionId ?? null,
        last_section_id: parsed.data.lastSectionId ?? null,
      })
      .eq('id', parsed.data.sessionId)
      .eq('form_id', shareLink.form_id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
