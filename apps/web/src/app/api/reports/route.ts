import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Product, SupportType } from '@tuturuuu/types';
import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const AFFECTED_PRODUCTS = [
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
] as const satisfies readonly Product[];

const REPORT_SUPPORT_TYPES = [
  'bug',
  'feature-request',
] as const satisfies readonly SupportType[];

const createReportSchema = z.object({
  product: z.enum(AFFECTED_PRODUCTS),
  suggestion: z.string().trim().min(1).max(MAX_MEDIUM_TEXT_LENGTH),
  type: z.enum(REPORT_SUPPORT_TYPES),
  subject: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  imagePaths: z
    .array(z.string().trim().min(1).max(MAX_MEDIUM_TEXT_LENGTH))
    .max(5)
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid JSON body.' },
        { status: 400 }
      );
    }
    const parsed = createReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed.error.issues[0]?.message ||
            'product, suggestion, type and subject are required.',
        },
        { status: 400 }
      );
    }

    const { product, suggestion, type, subject } = parsed.data;
    const imagePaths = parsed.data.imagePaths ?? [];

    // Create Supabase client for database operations
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get current user if authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Auth error:', authError);
    }

    // Create support inquiry first and get the generated ID
    const { data: insertData, error: insertError } = await sbAdmin
      .from('support_inquiries')
      .insert({
        name: 'Report Submission',
        email: user?.email || 'reports@tuturuuu.com',
        subject,
        message: suggestion,
        type,
        product,
        creator_id: user?.id || undefined,
        images: imagePaths,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating support inquiry:', insertError);
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to create support inquiry',
        },
        { status: 500 }
      );
    }

    console.log('Report submitted successfully:', {
      inquiryId: insertData.id,
      product,
      suggestion,
      mediaCount: imagePaths.length,
      uploadedMedia: imagePaths,
      userId: user?.id || 'anonymous',
    });

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully',
      reportId: insertData.id,
      uploadedMedia: imagePaths,
    });
  } catch (error) {
    console.error('Error processing report submission:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to submit report',
      },
      { status: 500 }
    );
  }
}
