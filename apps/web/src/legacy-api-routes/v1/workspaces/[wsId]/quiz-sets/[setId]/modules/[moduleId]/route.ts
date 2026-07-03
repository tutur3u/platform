import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string; setId: string; moduleId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { setId, moduleId } = await params;

  const { error } = await supabase
    .from('course_module_quiz_sets')
    .delete()
    .eq('module_id', moduleId)
    .eq('set_id', setId);

  if (error) {
    console.error('Error unlinking quiz-set module:', error);
    return NextResponse.json(
      { message: 'Failed to unlink quiz set module' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
