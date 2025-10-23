import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';

const ApiKeyUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    role_id: z.string().uuid().nullable().optional(),
    expires_at: z
      .string()
      .refine(
        (val) => {
          if (!val) return true; // null/empty is okay
          try {
            const date = new Date(val);
            return date.toISOString() === val;
          } catch {
            return false;
          }
        },
        { message: 'must be a valid ISO 8601 datetime' }
      )
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

interface Params {
  params: Promise<{
    wsId: string;
    keyId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, keyId: id } = await params;

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
    .eq('id', id)
    .eq('ws_id', wsId); // Ensure workspace scoping

  if (error) {
    console.error('Error updating API key:', error);
    return NextResponse.json(
      { message: 'Error updating workspace API key' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, keyId: id } = await params;

  const { error } = await supabase
    .from('workspace_api_keys')
    .delete()
    .eq('id', id)
    .eq('ws_id', wsId); // Ensure workspace scoping

  if (error) {
    console.error('Error deleting workspace API key:', error);
    return NextResponse.json(
      { message: 'Error deleting workspace API key' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
