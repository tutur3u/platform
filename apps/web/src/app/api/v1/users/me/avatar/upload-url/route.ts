import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

const PostAvatarUploadSchema = z.object({
  filename: z
    .string()
    .min(3)
    .regex(/^[^\\/]+\.[^\\/]+$/),
});

export async function POST(req: NextRequest) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData;

  try {
    const body = await req.json();
    const { filename } = PostAvatarUploadSchema.parse(body);

    // Generate unique file path
    const fileExt = filename.split('.').pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    // Create signed upload URL (valid for 60 seconds)
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage.from('avatars').createSignedUploadUrl(filePath, {
        upsert: false,
      });

    if (signedUrlError || !signedUrlData) {
      console.error('Error creating signed upload URL:', signedUrlError);
      return NextResponse.json(
        { message: 'Error generating upload URL' },
        { status: 500 }
      );
    }

    // Get the public URL for the file
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return NextResponse.json({
      uploadUrl: signedUrlData.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      filePath,
      token: signedUrlData.token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
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
