import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    slideId: string;
  }>;
}

export async function PUT(_: Request, { params: __ }: Params) {
  return NextResponse.json({ message: 'Not implemented' }, { status: 501 });

  // const supabase = await createClient();

  // const data = (await req.json()) as {
  //   name: string;
  //   color: string;
  //   group_ids: string[];
  // };

  // const { group_ids: _, ...coreData } = data;

  // const { error } = await supabase
  //   .from('workspace_slides')
  //   .update(coreData)
  //   .eq('id', id);

  // if (error) {
  //   console.log(error);
  //   return NextResponse.json(
  //     { message: 'Error updating workspace user group tag' },
  //     { status: 500 }
  //   );
  // }

  // return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params: __ }: Params) {
  return NextResponse.json({ message: 'Not implemented' }, { status: 501 });

  // const supabase = await createClient();

  // const { error } = await supabase
  //   .from('workspace_slides')
  //   .delete()
  //   .eq('id', id);

  // if (error) {
  //   console.log(error);
  //   return NextResponse.json(
  //     { message: 'Error deleting workspace user group tag' },
  //     { status: 500 }
  //   );
  // }

  // return NextResponse.json({ message: 'success' });
}
