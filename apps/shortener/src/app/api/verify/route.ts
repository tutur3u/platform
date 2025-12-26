import { createAdminClient } from '@tuturuuu/supabase/next/server';
import bcrypt from 'bcrypt';
import { type NextRequest, NextResponse } from 'next/server';
import { trackLinkClick } from '@/lib/analytics';

interface VerifyRequest {
  linkId: string;
  slug: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json();
    const { linkId, slug, password } = body;

    if (!linkId || !password) {
      return NextResponse.json(
        { error: 'Link ID and password are required' },
        { status: 400 }
      );
    }

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
    await trackLinkClick(link.id, slug);

    return NextResponse.json({ url: link.link, success: true });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
