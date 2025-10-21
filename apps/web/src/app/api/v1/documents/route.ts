/**
 * Documents API
 * GET /api/v1/documents - List documents
 * POST /api/v1/documents - Create document
 */

import {
  createErrorResponse,
  validateQueryParams,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Query parameters schema for listing
const listQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  isPublic: z
    .string()
    .optional()
    .transform((val) =>
      val === 'true' ? true : val === 'false' ? false : undefined
    ),
});

// Request body schema for creating
const createDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  content: z.string().optional(),
  isPublic: z.boolean().optional().default(false),
});

export const GET = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate query parameters
    const paramsResult = validateQueryParams(request, listQuerySchema);
    if (paramsResult instanceof NextResponse) {
      return paramsResult;
    }

    const { search, limit, offset, isPublic } = paramsResult.data;

    try {
      const supabase = await createClient();

      let query = supabase
        .from('workspace_documents')
        .select('id, name, content, is_public, created_at', { count: 'exact' })
        .eq('ws_id', wsId)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      // Filter by search term if provided
      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      // Filter by public status if provided
      if (isPublic !== undefined) {
        query = query.eq('is_public', isPublic);
      }

      const { data: documents, error, count } = await query;

      if (error) {
        console.error('Error listing documents:', error);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to list documents',
          500,
          'DOCUMENTS_LIST_ERROR'
        );
      }

      return NextResponse.json({
        data: documents || [],
        pagination: {
          limit,
          offset,
          total: count || 0,
        },
      });
    } catch (error) {
      console.error('Unexpected error listing documents:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_documents'] }
);

export const POST = withApiAuth(
  async (request, { context }) => {
    const { wsId } = context;

    // Validate request body
    const bodyResult = await validateRequestBody(request, createDocumentSchema);
    if (bodyResult instanceof NextResponse) {
      return bodyResult;
    }

    const { name, content, isPublic } = bodyResult.data;

    try {
      const supabase = await createClient();

      const { data: document, error } = await supabase
        .from('workspace_documents')
        .insert({
          ws_id: wsId,
          name,
          content,
          is_public: isPublic,
        })
        .select('id, name, content, is_public, created_at')
        .single();

      if (error) {
        console.error('Error creating document:', error);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to create document',
          500,
          'DOCUMENTS_CREATE_ERROR'
        );
      }

      return NextResponse.json({
        message: 'Document created successfully',
        data: document,
      });
    } catch (error) {
      console.error('Unexpected error creating document:', error);
      return createErrorResponse(
        'Internal Server Error',
        'An unexpected error occurred',
        500,
        'UNEXPECTED_ERROR'
      );
    }
  },
  { permissions: ['manage_documents'] }
);
