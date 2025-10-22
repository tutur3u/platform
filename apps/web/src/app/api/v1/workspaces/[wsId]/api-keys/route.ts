import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

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

  const data = await req.json();

  // Generate secure API key and hash server-side
  const { key, prefix } = generateApiKey();
  const keyHash = await hashApiKey(key);

  const { error } = await supabase.from('workspace_api_keys').insert({
    ...data,
    ws_id: id,
    key_hash: keyHash,
    key_prefix: prefix,
    // Don't store the plaintext key - it will only be returned once
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace API config' },
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
