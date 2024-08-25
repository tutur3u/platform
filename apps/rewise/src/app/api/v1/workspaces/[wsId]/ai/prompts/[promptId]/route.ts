import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    promptId: string;
  };
}

export async function GET(_: Request, { params: { promptId: id } }: Params) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_ai_prompts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching prompt' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params: { promptId: id } }: Params) {
  const supabase = createClient();
  const data = await req.json();

  const { error } = await supabase
    .from('workspace_ai_prompts')
    .update(data)
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace prompt' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: { promptId: id } }: Params) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_ai_prompts')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace prompt' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
