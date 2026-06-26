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
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const INQUIRY_PRODUCTS = [
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
] as const;

const createInquirySchema = z.object({
  name: z.string().min(2).max(MAX_DISPLAY_NAME_LENGTH),
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  type: z.enum(['bug', 'feature-request', 'support', 'job-application']),
  product: z.enum(INQUIRY_PRODUCTS),
  subject: z.string().min(5).max(255),
  message: z.string().min(10).max(MAX_SUPPORT_INQUIRY_LENGTH),
});

const listInquirySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  product: z.enum(INQUIRY_PRODUCTS).optional(),
  status: z.enum(['all', 'open', 'read', 'resolved', 'unread']).default('open'),
  type: z
    .enum(['bug', 'feature-request', 'support', 'job-application'])
    .optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!isValidTuturuuuEmail(user.email)) {
    return NextResponse.json(
      { message: 'Only Tuturuuu accounts can view inquiries' },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const parsed = listInquirySchema.safeParse(
    Object.fromEntries(url.searchParams)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { limit, page, product, status, type } = parsed.data;
  const offset = (page - 1) * limit;
  const sbAdmin = await createAdminClient();
  let query = sbAdmin
    .from('support_inquiries')
    .select('id, subject, type, product, is_read, is_resolved, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq('type', type);
  if (product) query = query.eq('product', product);

  if (status === 'unread') query = query.eq('is_read', false);
  if (status === 'read') query = query.eq('is_read', true);
  if (status === 'open') query = query.eq('is_resolved', false);
  if (status === 'resolved') query = query.eq('is_resolved', true);

  const { count, data, error } = await query;

  if (error) {
    return NextResponse.json(
      { message: 'Failed to load inquiries' },
      { status: 500 }
    );
  }

  return NextResponse.json({ count: count ?? 0, data: data ?? [] });
}

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
