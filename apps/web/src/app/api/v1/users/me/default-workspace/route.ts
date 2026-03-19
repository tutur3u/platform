import {
  getUserDefaultWorkspace,
  updateUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

export const GET = withSessionAuth(
  async (_req, { supabase }) => {
    try {
      const defaultWorkspace = await getUserDefaultWorkspace(supabase);

      return NextResponse.json(defaultWorkspace);
    } catch (error) {
      console.error('Error getting default workspace:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 300, swr: 60 } }
);

export const PATCH = withSessionAuth(async (req, { user, supabase }) => {
  try {
    const bodySchema = z.object({
      workspaceId: z.union([z.uuid(), z.null()]),
    });
    const parsedBody = bodySchema.safeParse(await req.json());

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request data', errors: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const { workspaceId } = parsedBody.data;

    // Handle clearing the default workspace
    if (!workspaceId || workspaceId === '') {
      const { error } = await supabase
        .from('user_private_details')
        .update({ default_workspace_id: null })
        .eq('user_id', user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    // Handle setting a default workspace
    const result = await updateUserDefaultWorkspace(workspaceId, supabase);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating default workspace:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
