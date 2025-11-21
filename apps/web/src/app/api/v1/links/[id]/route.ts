/**
 * Individual Link Management Endpoints
 * GET /api/v1/links/:id - Get link details
 * PATCH /api/v1/links/:id - Update link
 * DELETE /api/v1/links/:id - Delete link
 *
 * Requires authentication and workspace membership.
 */

import { withApiAuth } from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Schema for updating a link
const updateLinkSchema = z.object({
  url: z.string().url('Must be a valid URL').optional(),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Slug can only contain letters, numbers, hyphens, and underscores'
    )
    .optional(),
  domain: z.string().nullable().optional(),
});

// GET - Get link details
export const GET = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;

    const supabase = createClient();

    const { data, error } = await supabase
      .from('shortened_links')
      .select('*')
      .eq('id', id)
      .eq('ws_id', wsId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Link not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        id: data.id,
        url: data.link,
        slug: data.slug,
        domain: data.domain,
        creatorId: data.creator_id,
        createdAt: data.created_at,
      },
    });
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 200 },
  }
);

// PATCH - Update link
export const PATCH = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;
    const body = await request.json();

    const validatedData = updateLinkSchema.parse(body);

    const supabase = createClient();

    // Check if link exists
    const { data: existing } = await supabase
      .from('shortened_links')
      .select('id, slug')
      .eq('id', id)
      .eq('ws_id', wsId)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Link not found',
        },
        { status: 404 }
      );
    }

    // If slug is being updated, check if new slug is available
    if (validatedData.slug && validatedData.slug !== existing.slug) {
      const { data: slugExists } = await supabase
        .from('shortened_links')
        .select('id')
        .eq('slug', validatedData.slug)
        .single();

      if (slugExists) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: `Slug '${validatedData.slug}' is already taken`,
          },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (validatedData.url) updateData.link = validatedData.url;
    if (validatedData.slug) updateData.slug = validatedData.slug;
    if (validatedData.domain !== undefined) updateData.domain = validatedData.domain;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'No valid fields to update',
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('shortened_links')
      .update(updateData)
      .eq('id', id)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (error) {
      console.error('Error updating link:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to update link',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Link updated successfully',
      data: {
        id: data.id,
        url: data.link,
        slug: data.slug,
        domain: data.domain,
        creatorId: data.creator_id,
        createdAt: data.created_at,
      },
    });
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);

// DELETE - Delete link
export const DELETE = withApiAuth(
  async (
    request: NextRequest,
    { context, params }: { context: any; params: { id: string } }
  ) => {
    const { wsId } = context;
    const { id } = params;

    const supabase = createClient();

    // Check if link exists
    const { data: existing } = await supabase
      .from('shortened_links')
      .select('id')
      .eq('id', id)
      .eq('ws_id', wsId)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Link not found',
        },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from('shortened_links')
      .delete()
      .eq('id', id)
      .eq('ws_id', wsId);

    if (error) {
      console.error('Error deleting link:', error);
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'Failed to delete link',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Link deleted successfully',
    });
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 100 },
  }
);
