import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { permitsSupportCookieMutation } from '@/lib/support-inquiry-guard';

const updateInquirySchema = z.object({
  is_read: z.boolean().optional(),
  is_resolved: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!permitsSupportCookieMutation(request))
    return NextResponse.json(
      { message: 'Support inquiry updates require same-origin confirmation' },
      { status: 403 }
    );
  try {
    const { id } = await context.params;

    // Parse and validate request body
    const body = await request.json();
    const validation = updateInquirySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);

    // Verify user has valid Tuturuuu email
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user || !isVerifiedTuturuuuStaffSession(user, { allowXwf: true })) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Tuturuuu accounts can update inquiries.' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Update the inquiry
    const { data, error } = await sbAdmin
      .from('support_inquiries')
      .update(validation.data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating inquiry:', error);
      return NextResponse.json(
        { error: 'Failed to update inquiry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in PATCH /api/v1/inquiries/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
