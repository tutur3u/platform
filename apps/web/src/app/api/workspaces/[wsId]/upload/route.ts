import { createDynamicClient } from '@/utils/supabase/server';
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
  const fileName = url.searchParams.get('filename') || '';
  const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
  const fileExtension = fileName.substring(fileName.lastIndexOf('.') + 1);
  let newFileName = fileName;

  const formData = await req.formData();
  const file = formData.get('file');

  if (!file) {
    return NextResponse.json({ message: 'No file found' }, { status: 400 });
  }

  const supabase = createDynamicClient();

  // Check if a file with the same name already exists
  const { data: existingFileName } = await supabase
    .schema('storage')
    .from('objects')
    .select('*')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .eq('name', `${wsId}/${fileName}`)
    .order('name', { ascending: true });

  const { data: existingFileNames } = await supabase
    .schema('storage')
    .from('objects')
    .select('*')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .ilike('name', `${wsId}/${baseName}(%).${fileExtension}`)
    .order('name', { ascending: true });

  if (existingFileName && existingFileName.length > 0) {
    if (existingFileNames && existingFileNames.length > 0) {
      const lastFileName = existingFileNames[existingFileNames.length - 1].name;
      const lastFileNameIndex = parseInt(
        lastFileName.substring(
          lastFileName.lastIndexOf('(') + 1,
          lastFileName.lastIndexOf(')')
        )
      );
      newFileName = `${baseName}(${lastFileNameIndex + 1}).${fileExtension}`;
    } else {
      newFileName = `${baseName}(1).${fileExtension}`;
    }
  }

  const { data, error } = await supabase.storage
    .from(`workspaces/${wsId}`)
    .upload(newFileName, file);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error uploading file' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
