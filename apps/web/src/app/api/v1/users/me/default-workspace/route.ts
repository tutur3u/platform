import {
  getUserDefaultWorkspace,
  updateUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await authorizeRequest(req);
    if (error || !data)
      return (
        error || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

    const { supabase } = data;

    const defaultWorkspace = await getUserDefaultWorkspace(supabase);

    return NextResponse.json(defaultWorkspace);
  } catch (error) {
    console.error('Error getting default workspace:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { data: authData, error: authError } = await authorizeRequest(req);
    if (authError || !authData)
      return (
        authError ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

    const { user, supabase } = authData;
    const bodySchema = z.object({
      workspaceId: z.uuid(),
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
}
