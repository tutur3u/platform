import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const mediaUrlSchema = z.object({
  mediaPaths: z.array(z.string().min(1)).max(20),
});

export const POST = withSessionAuth(async (request, { user }) => {
  try {
    const inquiryId = request.nextUrl.pathname.split('/').slice(-2, -1)[0];
    const parsed = mediaUrlSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const sbAdmin = await createDynamicAdminClient();
    const { data: inquiry, error: inquiryError } = await sbAdmin
      .from('support_inquiries')
      .select('id, creator_id')
      .eq('id', inquiryId)
      .maybeSingle();

    if (inquiryError) {
      return NextResponse.json(
        { message: 'Failed to load inquiry' },
        { status: 500 }
      );
    }

    if (!inquiry || inquiry.creator_id !== user.id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const entries = await Promise.all(
      parsed.data.mediaPaths.map(async (mediaPath) => {
        const { data, error } = await sbAdmin.storage
          .from('support_inquiries')
          .createSignedUrl(`${inquiryId}/${mediaPath}`, 300);

        if (error || !data?.signedUrl) {
          return [mediaPath, null] as const;
        }

        return [mediaPath, data.signedUrl] as const;
      })
    );

    return NextResponse.json({
      urls: Object.fromEntries(entries.filter((entry) => entry[1] !== null)),
    });
  } catch (error) {
    console.error('Unexpected inquiry media url error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
});
