import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

const PatchFullNameSchema = z.object({
  full_name: z.string().min(1).max(50),
});

export async function PATCH(req: NextRequest) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;

  try {
    const body = await req.json();
    const { full_name } = PatchFullNameSchema.parse(body);

    const { error } = await supabase
      .from('user_private_details')
      .upsert({ user_id: user.id, full_name }, { onConflict: 'user_id' });

    if (error) {
      console.error('Error updating full name:', error);
      return NextResponse.json(
        { message: 'Error updating full name' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Full name updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid full name', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Request error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
