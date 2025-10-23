import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';

const ApiKeyCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(), // Description is optional
  role_id: z.string().nullable(),
  expires_at: z
    .string()
    .refine(
      (val) => {
        if (!val) return true; // null/empty is okay
        try {
          const date = new Date(val);
          // Validate it's a proper ISO 8601 datetime
          return date.toISOString() === val;
        } catch {
          return false;
        }
      },
      { message: 'expires_at must be a valid ISO 8601 datetime' }
    )
    .nullable(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  // SECURITY: Explicitly select only safe columns, excluding key_hash and value
  const { data, error } = await supabase
    .from('workspace_api_keys')
    .select(
      'id, ws_id, name, description, key_prefix, role_id, last_used_at, expires_at, created_at, updated_at, created_by'
    )
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
      { message: 'Error creating workspace API key' },
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
