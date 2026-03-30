import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const mediaUrlSchema = z.object({
  mediaPaths: z.array(z.string().min(1)).max(20),
});

const inquiryIdSchema = z.guid();

export const POST = withSessionAuth(async (request, { user }) => {
  try {
    const pathnameParts = request.nextUrl.pathname.split('/');
    const inquiryIdRaw = pathnameParts[pathnameParts.length - 2];
    const inquiryIdResult = inquiryIdSchema.safeParse(inquiryIdRaw);

    if (!inquiryIdResult.success) {
      return NextResponse.json(
        { message: 'Invalid inquiry ID' },
        { status: 400 }
      );
    }

    const inquiryId = inquiryIdResult.data;
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
      .select('id, creator_id, images')
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

    const allowedPaths = new Set(
      (inquiry.images ?? []).map((path: string) => path.replace(/^\/+/, ''))
    );

    const entries = await Promise.all(
      parsed.data.mediaPaths.map(async (mediaPath) => {
        const normalizedPath = mediaPath.replace(/^\/+/, '');

        if (!allowedPaths.has(normalizedPath)) {
          return [mediaPath, null] as const;
        }

        const { data, error } = await sbAdmin.storage
          .from('support_inquiries')
          .createSignedUrl(normalizedPath, 300);

        if (!error && data?.signedUrl) {
          return [mediaPath, data.signedUrl] as const;
        }

        const { data: legacyData, error: legacyError } = await sbAdmin.storage
          .from('support_inquiries')
          .createSignedUrl(`${inquiryId}/${normalizedPath}`, 300);

        if (legacyError || !legacyData?.signedUrl) {
          return [mediaPath, null] as const;
        }

        return [mediaPath, legacyData.signedUrl] as const;
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
