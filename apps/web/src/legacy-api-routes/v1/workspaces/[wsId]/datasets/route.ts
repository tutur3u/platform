import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { withWorkspaceDatasetsAccess } from './dataset-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId } = await params;

  return withWorkspaceDatasetsAccess(
    req,
    wsId,
    async (supabase, apiKeyContext) => {
      const { data, count, error } = await supabase
        .from('workspace_datasets')
        .select('*', { count: 'exact' })
        .eq('ws_id', wsId);

      if (error) {
        console.log(error);
        return NextResponse.json(
          { message: 'Error fetching workspace datasets' },
          { status: 500 }
        );
      }

      return apiKeyContext
        ? NextResponse.json({ data, count })
        : NextResponse.json(data || []);
    }
  );
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const data = await req.json();

  const { error } = await supabase.from('workspace_datasets').insert({
    ...data,
    ws_id: id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace dataset' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
