import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { ownedProfileAvatarPath } from '@/lib/profile-avatar-url';

export const DELETE = withSessionAuth(
  async (_req, { user, supabase }) => {
    try {
      const { data: userData, error: readError } = await supabase
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
      if (!readError && userData?.avatar_url) {
        try {
          // Cookie clients retain RLS; app-session clients are admin-backed.
          // Validate the original URL immediately before either storage delete.
          const filePath = ownedProfileAvatarPath(userData.avatar_url, user.id);
          if (filePath) {
            await supabase.storage.from('avatars').remove([filePath]);
          }
        } catch (storageError) {
          // Non-critical error, log but don't fail the request
          console.warn(
            'Error deleting avatar file from storage:',
            storageError
          );
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
  },
  { allowAppSessionAuth: true }
);
