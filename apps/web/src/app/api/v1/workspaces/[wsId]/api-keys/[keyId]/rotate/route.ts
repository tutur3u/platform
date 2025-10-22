import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    keyId: string;
  }>;
}

export async function POST(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { keyId: id } = await params;

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Fetch the existing API key
  const { data: existingKey, error: fetchError } = await supabase
    .from('workspace_api_keys')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existingKey) {
    return NextResponse.json({ message: 'API key not found' }, { status: 404 });
  }

  // Generate new API key and hash
  const { key, prefix } = generateApiKey();
  const keyHash = await hashApiKey(key);

  // Update the existing key record with new hash and prefix
  const { error: updateError } = await supabase
    .from('workspace_api_keys')
    .update({
      key_hash: keyHash,
      key_prefix: prefix,
      last_used_at: null, // Reset last used timestamp
    })
    .eq('id', id);

  if (updateError) {
    console.error('Error rotating API key:', updateError);
    return NextResponse.json(
      { message: updateError.message || 'Error rotating API key' },
      { status: 500 }
    );
  }

  // Return the new plaintext key to the user (only time they'll see it)
  return NextResponse.json({
    message: 'API key rotated successfully',
    key,
    prefix,
  });
}
