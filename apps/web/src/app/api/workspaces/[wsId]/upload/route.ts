import { createClient } from '@/utils/supabase/server';
import { generateRandomUUID } from '@/utils/uuid-helper';
import { NextResponse } from 'next/server';

interface Props {
  params: {
    wsId: string;
  };
}

export async function POST(req: Request, { params: { wsId } }: Props) {
  // Parse the request URL
  const url = new URL(req.url);

  // Extract query parameters
  const filename = url.searchParams.get('filename') || '';

  const formData = await req.formData();
  const file = formData.get('file');

  if (!file) {
    return NextResponse.json({ message: 'No file found' }, { status: 400 });
  }

  const supabase = createClient();

  const { data, error } = await supabase.storage
    .from(`workspaces/${wsId}`)
    .upload(`${generateRandomUUID()}_${filename}`, file);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error uploading file' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
