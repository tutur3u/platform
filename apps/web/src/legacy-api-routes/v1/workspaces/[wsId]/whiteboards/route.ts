import { resolveCoMemberNames } from '@tuturuuu/utils/co-member-names';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWhiteboardAccess } from './access';

const createWhiteboardSchema = z.object({
  title: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  description: z.string().trim().max(MAX_LONG_TEXT_LENGTH).nullish(),
});

/**
 * Lists the workspace's boards for the Whiteboards app. Creator names follow
 * the co-member rules (D246): the resolver enforces HIDE_MEMBER_EMAIL and
 * same-workspace membership, so no email is returned as a separate field.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const access = await requireWhiteboardAccess(request, (await params).wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, user, wsId } = access;
    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .select(
        `id, title, description, created_at, updated_at, archived_at, creator_id,
        creator:users(display_name, handle)`
      )
      .eq('ws_id', wsId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error listing whiteboards:', error);
      return NextResponse.json(
        { error: 'Failed to list whiteboards' },
        { status: 500 }
      );
    }

    const creatorNames = await resolveCoMemberNames({
      admin: sbAdmin,
      wsId,
      viewerUserId: user.id,
      users: data.map((whiteboard) => ({
        id: whiteboard.creator_id,
        display_name: whiteboard.creator?.display_name,
        handle: whiteboard.creator?.handle,
      })),
    });

    return NextResponse.json({
      whiteboards: data.map(({ creator, creator_id, ...whiteboard }) => ({
        ...whiteboard,
        creator_name:
          (creator ? creatorNames.get(creator_id) : '') ||
          resolveUserDisplayName(creator, { fallback: '' }) ||
          null,
      })),
    });
  } catch (error) {
    console.error('Error in whiteboards GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const access = await requireWhiteboardAccess(request, (await params).wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, user, wsId } = access;
    const body = createWhiteboardSchema.parse(await request.json());

    const { data, error } = await sbAdmin
      .from('workspace_whiteboards')
      .insert({
        title: body.title,
        description: body.description || null,
        ws_id: wsId,
        creator_id: user.id,
      })
      .select('id, title, description, created_at, updated_at, archived_at')
      .single();

    if (error) {
      console.error('Error creating whiteboard:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create whiteboard' },
        { status: 500 }
      );
    }

    return NextResponse.json({ whiteboard: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboards POST route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
