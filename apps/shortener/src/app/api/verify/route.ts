import { createAdminClient } from '@tuturuuu/supabase/next/server';
import bcrypt from 'bcrypt';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackLinkClick } from '@/lib/analytics';

const verifySchema = z.object({
  linkId: z.string(),
  password: z.string(),
  slug: z.string().optional(),
});

/**
 * POST handler for verifying password-protected links.
 *
 * @param {NextRequest} request - The incoming request containing link context and password.
 * @returns {Promise<NextResponse>} A JSON response with the destination URL or an error message.
 *
 * @example
 * // Request body
 * {
 *   "linkId": "uuid-here",
 *   "password": "plain-text-password",
 *   "slug": "optional-slug"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const result = verifySchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: result.error.format(),
        },
        { status: 400 }
      );
    }

    const { linkId, slug, password } = result.data;

    const sbAdmin = await createAdminClient();

    // Get the link with password hash
    const { data: link, error: fetchError } = await sbAdmin
      .from('shortened_links')
      .select('id, link, password_hash')
      .eq('id', linkId)
      .single();

    if (fetchError || !link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    if (!link.password_hash) {
      // Link is not password protected, redirect directly
      return NextResponse.json({ url: link.link });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, link.password_hash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.' },
        { status: 403 }
      );
    }

    // Track analytics on successful password verification
    await trackLinkClick(link.id, slug ?? '');

    return NextResponse.json({ url: link.link, success: true });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
