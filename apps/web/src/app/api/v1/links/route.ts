/**
 * Links Management Endpoints
 * POST /api/v1/links - Create short link
 * GET /api/v1/links - List short links
 *
 * Requires authentication and workspace membership.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for creating a link
const createLinkSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Slug can only contain letters, numbers, hyphens, and underscores'
    )
    .optional(),
  domain: z.string().optional(),
});

// POST - Create short link
export const POST = withApiAuth(
  async (request: NextRequest, { context }: { context: any }) => {
    const { wsId, userId } = context;
    const body = await request.json();

    const validatedData = createLinkSchema.parse(body);

    const supabase = createClient();

    // Generate slug if not provided
    let slug = validatedData.slug;
    if (!slug) {
      slug = generateRandomSlug();
    }

    // Check if slug already exists
    const { data: existing } = await supabase
      .from('shortened_links')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: `Slug '${slug}' is already taken`,
        },
        { status: 400 }
      );
    }

    // Create the link
    const { data, error } = await supabase
      .from('shortened_links')
      .insert({
        link: validatedData.url,
        slug,
        domain: validatedData.domain || null,
        ws_id: wsId,
        creator_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating link:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to create link',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Link created successfully',
        data: {
          id: data.id,
          url: data.link,
          slug: data.slug,
          domain: data.domain,
          createdAt: data.created_at,
        },
      },
      { status: 201 }
    );
  },
  {
    permissions: ['manage_drive'], // Using drive permission for now
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);

// GET - List short links
export const GET = withApiAuth(
  async (request: NextRequest, { context }: { context: any }) => {
    const { wsId } = context;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50'),
      100
    );
    const offset = parseInt(searchParams.get('offset') || '0');
    const domain = searchParams.get('domain');

    const supabase = createClient();

    let query = supabase
      .from('shortened_links')
      .select('*', { count: 'exact' })
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    // Filter by domain if provided
    if (domain) {
      query = query.eq('domain', domain);
    }

    const { data, count, error } = await query.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error('Error fetching links:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to fetch links',
        },
        { status: 500 }
      );
    }

    const transformedData = (data || []).map((link) => ({
      id: link.id,
      url: link.link,
      slug: link.slug,
      domain: link.domain,
      creatorId: link.creator_id,
      createdAt: link.created_at,
    }));

    return NextResponse.json({
      data: transformedData,
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    });
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 200 },
  }
);

// Helper function to generate random slug
function generateRandomSlug(length: number = 6): string {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
