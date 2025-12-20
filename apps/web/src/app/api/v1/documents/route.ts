/**
 * Documents API
 * GET /api/v1/documents - List documents
 * POST /api/v1/documents - Create document
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { createDocumentDataSchema } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  validateQueryParams,
  validateRequestBody,
  withApiAuth,
} from '@/lib/api-middleware';

// Query parameters schema for listing (query string transformations)
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
        .select('id, name, is_public, created_at', { count: 'exact' })
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

      // Map database snake_case to SDK camelCase
      const mappedDocuments = (documents || []).map(
        ({ is_public, created_at, ...rest }) => ({
          ...rest,
          isPublic: is_public,
          createdAt: created_at,
        })
      );

      return NextResponse.json({
        data: mappedDocuments,
        pagination: {
          limit,
          offset,
          filteredTotal: count || 0, // Count after filters are applied
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
    const bodyResult = await validateRequestBody(
      request,
      createDocumentDataSchema
    );
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

      if (error || !document) {
        console.error('Error creating document:', error);
        return createErrorResponse(
          'Internal Server Error',
          'Failed to create document',
          500,
          'DOCUMENTS_CREATE_ERROR'
        );
      }

      // Map database snake_case to SDK camelCase
      const { is_public, created_at, ...rest } = document;
      return NextResponse.json({
        message: 'Document created successfully',
        data: { ...rest, isPublic: is_public, createdAt: created_at },
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
