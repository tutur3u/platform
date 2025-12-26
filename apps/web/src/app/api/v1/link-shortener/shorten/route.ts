import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { type NextRequest, NextResponse } from 'next/server';

interface ShortenRequest {
  url: string;
  customSlug?: string;
  wsId?: string;
  password?: string;
  passwordHint?: string;
}

// Validate URL format
function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

// Validate slug format (alphanumeric, hyphens, underscores only)
function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9\-_]+$/.test(slug);
}

// Generate a random slug
function generateSlug(length = 6): string {
  return nanoid(length);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ShortenRequest = await request.json();
    const { url, customSlug, wsId, password, passwordHint } = body;

    // Validate required fields
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400 }
      );
    }

    if (!wsId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!isValidUrl(url.trim())) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Validate custom slug if provided
    if (customSlug && (!isValidSlug(customSlug) || customSlug.length > 50)) {
      return NextResponse.json(
        {
          error:
            'Custom slug can only contain letters, numbers, hyphens, and underscores (max 50 characters)',
        },
        { status: 400 }
      );
    }

    // Validate password if provided
    if (password && (password.length < 4 || password.length > 100)) {
      return NextResponse.json(
        { error: 'Password must be between 4 and 100 characters' },
        { status: 400 }
      );
    }

    // Validate password hint length
    if (passwordHint && passwordHint.length > 200) {
      return NextResponse.json(
        { error: 'Password hint must be 200 characters or less' },
        { status: 400 }
      );
    }

    // Hash password if provided
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    // Determine the slug to use
    let slug = customSlug || generateSlug();

    // Check if the slug already exists and generate a new one if needed
    let attempts = 0;
    const maxAttempts = 10;

    const sbAdmin = await createAdminClient();

    while (attempts < maxAttempts) {
      const { data: existingLink } = await sbAdmin
        .from('shortened_links')
        .select('id')
        .eq('slug', slug)
        .single();

      if (!existingLink) {
        // Slug is available
        break;
      }

      if (customSlug) {
        // Custom slug is taken
        return NextResponse.json(
          { error: 'Custom slug is already taken' },
          { status: 409 }
        );
      }

      // Generate a new random slug
      slug = generateSlug();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: 'Failed to generate unique slug. Please try again.' },
        { status: 500 }
      );
    }

    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', wsId)
      .eq('user_id', user?.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Insert the new shortened link
    const { data: newLink, error: insertError } = await sbAdmin
      .from('shortened_links')
      .insert({
        link: url.trim(),
        slug,
        creator_id: user.id,
        ws_id: wsId,
        domain: new URL(url.trim()).hostname,
        password_hash: passwordHash,
        password_hint: passwordHint?.trim() || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create shortened link' },
        { status: 500 }
      );
    }

    return NextResponse.json(newLink, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
