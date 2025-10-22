import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';

const ApiKeyCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  role_id: z.string().nullable(),
  expires_at: z.string().nullable(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { data, error } = await supabase
    .from('workspace_api_keys')
    .select('*')
    .eq('ws_id', id)
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Parse and validate request body
  const body = await req.json();
  const validation = ApiKeyCreateSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { message: 'Invalid request', errors: validation.error.issues },
      { status: 400 }
    );
  }

  const data = validation.data;

  // Generate secure API key and hash server-side
  const { key, prefix } = generateApiKey();
  const keyHash = await hashApiKey(key);

  const { error } = await supabase.from('workspace_api_keys').insert({
    ws_id: id,
    name: data.name,
    description: data.description,
    role_id: data.role_id,
    expires_at: data.expires_at,
    key_hash: keyHash,
    key_prefix: prefix,
    created_by: user.id,
  });

  if (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { message: error.message || 'Error creating workspace API key' },
      { status: 500 }
    );
  }

  // Return the plaintext key to the user (only time they'll see it)
  return NextResponse.json({
    message: 'API key created successfully',
    key,
    prefix,
  });
}
