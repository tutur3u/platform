import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { display_name, bio, avatar_url } = body;

    // Update user profile
    const { error: userError } = await supabase
      .from('users')
      .update({
        display_name,
        bio,
        avatar_url,
      })
      .eq('id', user.id);

    if (userError) {
      console.error('Error updating user:', userError);
      return NextResponse.json(
        { message: 'Error updating profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { message: 'Error updating profile' },
      { status: 500 }
    );
  }
}
