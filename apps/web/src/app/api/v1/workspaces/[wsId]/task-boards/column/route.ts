import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createClient();

  const { boardId, title } = await req.json();
  try {
    const { error } = await supabase.from('workspace_boards_columns').insert({
      boardId,
      title,
    });
    if (error) {
      console.error('Error inserting data:', error);
      return NextResponse.json(
        { message: 'Error inserting data', error },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Data inserted successfully' },
      { status: 201 }
    );
  } catch (err) {
    console.error('Exception during Supabase insert:', err);
    return NextResponse.json(
      { message: 'Error processing request', error: err },
      { status: 500 }
    );
  }
}
