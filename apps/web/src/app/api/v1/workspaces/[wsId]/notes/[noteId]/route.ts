import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

// TipTap JSONContent schema for rich text
const jsonContentSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.string().max(MAX_SHORT_TEXT_LENGTH),
    attrs: z.record(z.string(), z.any()).optional(),
    content: z.array(jsonContentSchema).optional(),
    marks: z.array(z.any()).optional(),
    text: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  })
);

const updateNoteSchema = z.object({
  title: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
  content: jsonContentSchema
    .refine(
      (val) => val.type === 'doc',
      'Content must be a valid TipTap document'
    )
    .optional(),
  archived: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; noteId: string }> }
) {
  try {
    const { wsId, noteId } = await params;
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { title, content, archived } = updateNoteSchema.parse(body);

    // Update note
    const { data: updatedNote, error: updateError } = await supabase
      .from('notes')
      .update({
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(archived !== undefined && { archived }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', noteId)
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating note:', updateError);
      return NextResponse.json(
        { error: 'Failed to update note' },
        { status: 500 }
      );
    }

    if (!updatedNote) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json(updatedNote, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error(
      'Error in PUT /api/v1/workspaces/[wsId]/notes/[noteId]:',
      error
    );
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; noteId: string }> }
) {
  try {
    const { wsId, noteId } = await params;
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    // Verify user has access to workspace
    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete note
    const { error: deleteError } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('ws_id', wsId)
      .eq('creator_id', user.id);

    if (deleteError) {
      console.error('Error deleting note:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      'Error in DELETE /api/v1/workspaces/[wsId]/notes/[noteId]:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
