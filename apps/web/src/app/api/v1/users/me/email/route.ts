import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

const PatchEmailSchema = z.object({
  email: z.string().email(),
});

export async function PATCH(req: NextRequest) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;
  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization');
  const isBearerToken = authHeader?.startsWith('Bearer ') ?? false;

  try {
    const body = await req.json();
    const { email } = PatchEmailSchema.parse(body);

    const { error } = isBearerToken
      ? await supabase.auth.admin.updateUserById(user.id, { email })
      : await supabase.auth.updateUser({ email });

    if (error) {
      console.error('Error updating email:', error);
      return NextResponse.json(
        { message: 'Error updating email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Email update initiated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid email format', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Request error:', error);
    return NextResponse.json(
      { message: 'Error processing request' },
      { status: 500 }
    );
  }
}
