import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const linkModulesSchema = z.object({
  moduleIds: z.array(z.string().min(1)).min(1),
});

interface Params {
  params: Promise<{ wsId: string; setId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { setId } = await params;
  const parsed = linkModulesSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('course_module_quiz_sets').upsert(
    parsed.data.moduleIds.map((moduleId) => ({
      module_id: moduleId,
      set_id: setId,
    }))
  );

  if (error) {
    console.error('Error linking quiz-set modules:', error);
    return NextResponse.json(
      { message: 'Failed to link quiz set modules' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
