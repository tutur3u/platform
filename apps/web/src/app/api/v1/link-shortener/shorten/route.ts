import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ShortenRequestSchema = z.object({
  url: z.string().url(),
  customSlug: z
    .string()
    .regex(/^[a-zA-Z0-9\-_]+$/)
    .max(50)
    .optional(),
  wsId: z.string(),
  password: z.string().min(4).max(100).optional(),
  passwordHint: z.string().max(200).optional(),
});



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

    const parsed = ShortenRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { url, customSlug, wsId, password, passwordHint } = parsed.data;

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
