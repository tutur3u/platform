import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_SUPPORT_INQUIRY_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createInquirySchema = z.object({
  name: z.string().min(2).max(MAX_DISPLAY_NAME_LENGTH),
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  type: z.enum(['bug', 'feature-request', 'support', 'job-application']),
  product: z.enum([
    'web',
    'nova',
    'rewise',
    'calendar',
    'finance',
    'tudo',
    'tumeet',
    'shortener',
    'qr',
    'drive',
    'mail',
    'other',
  ]),
  subject: z.string().min(5).max(255),
  message: z.string().min(10).max(MAX_SUPPORT_INQUIRY_LENGTH),
});

export async function POST(request: Request) {
  try {
    const parsed = createInquirySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const { data: inquiry, error } = await sbAdmin
      .from('support_inquiries')
      .insert({
        ...parsed.data,
        creator_id: user.id,
      })
      .select('id')
      .single();

    if (error || !inquiry) {
      console.error('Failed to create support inquiry:', error);
      return NextResponse.json(
        { message: 'Failed to create inquiry' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, inquiryId: inquiry.id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected inquiry creation error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
