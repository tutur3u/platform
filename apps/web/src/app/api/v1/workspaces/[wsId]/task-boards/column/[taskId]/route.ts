import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    taskId: string;
  };
}

export async function POST(req: Request, { params: { taskId } }: Params) {
  const supabase = createClient();

  try {
    // Parse the request body as JSON
    const data = await req.json();

    // Ensure the necessary properties exist
    if (!data.tasks || !data.tasks.position || !data.tasks.columnId) {
      return NextResponse.json(
        { message: 'Invalid input data' },
        { status: 400 }
      );
    }

    // Update the task in the Supabase table
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
