import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().email().optional(),
});

export async function PATCH(request: NextRequest) {
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid profile payload' },
      { status: 400 }
    );
  }

  const supabase = await createClient(request);
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({
    email: parsed.data.email,
    data: {
      display_name: parsed.data.displayName,
      auth_client: 'tulearn',
      origin: 'TULEARN',
    },
  });

  if (error) {
    return NextResponse.json(
      { message: 'Unable to update profile' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
