import { createClient } from '@tuturuuu/supabase/next/server';
import { updateUserDefaultWorkspace } from '@tuturuuu/utils/user-helper';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId } = body;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

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
    const result = await updateUserDefaultWorkspace(workspaceId);

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
