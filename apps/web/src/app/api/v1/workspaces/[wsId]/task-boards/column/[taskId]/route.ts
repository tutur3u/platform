import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    taskId: string;
  };
}

export async function POST(req: Request, { params: { taskId } }: Params) {
  const supabase = createClient();
  // Parse the request body only once and store it
  const data = await req.json();



  try {
    const { error } = await supabase
      .from('workspace_board_tasks')
      .update({ position: data.tasks.position, columnId: data.tasks.columnId }) // Ensure column_id matches your DB field
      .eq('id', taskId); // Use taskId from params

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
