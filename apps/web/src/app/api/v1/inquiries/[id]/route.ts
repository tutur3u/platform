import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateInquirySchema = z.object({
  is_read: z.boolean().optional(),
  is_resolved: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Verify user has valid Tuturuuu email
    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.log('Authenticated user:', user?.email);

    if (!user || !isValidTuturuuuEmail(user.email)) {
      return NextResponse.json(
        { error: 'Unauthorized. Only Tuturuuu accounts can update inquiries.' },
        { status: 401 }
      );
    }

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
