import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWhiteboardAccess } from '../access';

const paramsSchema = z.object({
  boardId: z.string().uuid(),
  wsId: z.string().min(1),
});

const updateWhiteboardSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
    description: z
      .string()
      .trim()
      .max(MAX_LONG_TEXT_LENGTH)
      .nullable()
      .optional(),
    snapshot: z.string().nullable().optional(),
    archived_at: z.string().datetime().nullable().optional(),
    updated_at: z.string().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .select(
        'id, title, description, snapshot, created_at, updated_at, archived_at'
      )
      .eq('ws_id', wsId)
      .eq('id', parsedParams.boardId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching whiteboard:', error);
      return NextResponse.json(
        { error: 'Failed to fetch whiteboard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Whiteboard not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ whiteboard: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or whiteboard ID', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const body = updateWhiteboardSchema.parse(await request.json());

    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .update(body)
      .eq('ws_id', wsId)
      .eq('id', parsedParams.boardId)
      .select(
        'id, title, description, snapshot, created_at, updated_at, archived_at'
      )
      .maybeSingle();

    if (error) {
      console.error('Error updating whiteboard:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update whiteboard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Whiteboard not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ whiteboard: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard PATCH route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .delete()
      .eq('ws_id', wsId)
      .eq('id', parsedParams.boardId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error deleting whiteboard:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to delete whiteboard' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Whiteboard not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or whiteboard ID', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard DELETE route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
