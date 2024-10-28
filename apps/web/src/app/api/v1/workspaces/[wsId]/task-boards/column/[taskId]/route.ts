import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { taskId } = await params;
  try {
    const data = await req.json();

    if (!data.tasks || !data.tasks.position || !data.tasks.columnId) {
      return NextResponse.json(
        { message: 'Invalid input data' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('workspace_board_tasks')
      .update({ position: data.tasks.position, columnId: data.tasks.columnId })
      .eq('id', taskId);

    if (error) throw error;

    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { message: 'Error updating task' },
      { status: 500 }
    );
  }
}
