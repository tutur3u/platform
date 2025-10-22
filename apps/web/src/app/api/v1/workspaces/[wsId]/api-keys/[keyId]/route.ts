import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';

const ApiKeyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  role_id: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
});

interface Params {
  params: Promise<{
    keyId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { keyId: id } = await params;

  // Parse and validate request body
  const body = await req.json();
  const validation = ApiKeyUpdateSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Invalid request', errors: validation.error.issues },
      { status: 400 }
    );
  }

  const data = validation.data;

  const { error } = await supabase
    .from('workspace_api_keys')
    .update(data)
    .eq('id', id);

  if (error) {
    console.error('Error updating API key:', error);
    return NextResponse.json(
      { message: error.message || 'Error updating workspace API key' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { keyId: id } = await params;

  const { error } = await supabase
    .from('workspace_api_keys')
    .delete()
    .eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
