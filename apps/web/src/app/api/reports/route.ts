import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
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

function normalizeReportImagePath(path: string) {
  const trimmedPath = path.trim().replace(/^\/+/, '');

  if (!trimmedPath || trimmedPath.includes('..')) {
    return null;
  }

  return trimmedPath;
}

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

    const normalizedImagePaths = imagePaths.map(normalizeReportImagePath);
    if (normalizedImagePaths.some((path) => path === null)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid image path provided',
        },
        { status: 400 }
      );
    }

    const sanitizedImagePaths = normalizedImagePaths.filter(
      (path): path is string => path !== null
    );

    // Create Supabase client for database operations
    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    // Get current user if authenticated
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError) {
      console.error('Auth error:', authError);
    }

    if (!user && sanitizedImagePaths.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Media uploads require an authenticated user',
        },
        { status: 403 }
      );
    }

    const verifiedImagePaths =
      user && sanitizedImagePaths.length > 0
        ? sanitizedImagePaths.filter((path) => path.startsWith(`${user.id}/`))
        : sanitizedImagePaths;

    if (verifiedImagePaths.length !== sanitizedImagePaths.length) {
      return NextResponse.json(
        {
          success: false,
          message: 'One or more media paths were not issued for this user',
        },
        { status: 403 }
      );
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
        images: verifiedImagePaths,
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
      mediaCount: verifiedImagePaths.length,
      userId: user?.id || 'anonymous',
    });

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully',
      reportId: insertData.id,
      uploadedMedia: verifiedImagePaths,
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
