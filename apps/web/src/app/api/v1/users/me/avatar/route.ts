import { type NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/api-auth';

export async function DELETE(req: NextRequest): Promise<Response> {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;

  try {
    // Get current avatar URL to delete from storage
    const { data: userData } = await supabase
      .from('users')
      .select('avatar_url')
      .eq('id', user.id)
      .single();

    // Update user record to remove avatar_url
    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: null })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error removing avatar URL:', updateError);
      return NextResponse.json(
        { message: 'Error removing avatar' },
        { status: 500 }
      );
    }

    // Optionally delete the file from storage (best effort)
    if (userData?.avatar_url) {
      try {
        const url = new URL(userData.avatar_url);
        const pathParts = url.pathname.split('/avatars/');
        if (pathParts.length > 1 && pathParts[1]) {
          const filePath = pathParts[1];
          await supabase.storage.from('avatars').remove([filePath]);
        }
      } catch (storageError) {
        // Non-critical error, log but don't fail the request
        console.warn('Error deleting avatar file from storage:', storageError);
      }
    }

    return NextResponse.json({ message: 'Avatar removed successfully' });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json(
      {
        message: 'Error processing request',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
