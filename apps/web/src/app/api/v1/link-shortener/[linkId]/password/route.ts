import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import bcrypt from 'bcrypt';
import { type NextRequest, NextResponse } from 'next/server';

interface PasswordUpdateRequest {
  currentPassword?: string;
  newPassword?: string;
  passwordHint?: string;
}

interface RouteContext {
  params: Promise<{ linkId: string }>;
}

// PATCH: Update password
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { linkId } = await context.params;
    const body: PasswordUpdateRequest = await request.json();
    const { currentPassword, newPassword, passwordHint } = body;

    // Get the link and verify ownership
    const { data: link, error: fetchError } = await sbAdmin
      .from('shortened_links')
      .select('id, ws_id, password_hash')
      .eq('id', linkId)
      .single();

    if (fetchError || !link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // Verify user is a member of the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', link.ws_id)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If link already has a password, verify current password
    if (link.password_hash) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required' },
          { status: 400 }
        );
      }

      const isValidPassword = await bcrypt.compare(
        currentPassword,
        link.password_hash
      );
      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 403 }
        );
      }
    }

    // Validate new password if provided
    if (newPassword && (newPassword.length < 4 || newPassword.length > 100)) {
      return NextResponse.json(
        { error: 'Password must be between 4 and 100 characters' },
        { status: 400 }
      );
    }

    // Validate password hint if provided
    if (passwordHint && passwordHint.length > 200) {
      return NextResponse.json(
        { error: 'Password hint must be 200 characters or less' },
        { status: 400 }
      );
    }

    // Build update payload dynamically - only include fields that are explicitly provided
    const updatePayload: {
      password_hash?: string | null;
      password_hint?: string | null;
    } = {};

    // Only update password if newPassword is provided
    if (newPassword !== undefined) {
      updatePayload.password_hash = await bcrypt.hash(newPassword, 10);
    }

    // Only update hint if passwordHint is provided (including empty string to clear it)
    if (passwordHint !== undefined) {
      updatePayload.password_hint = passwordHint.trim() || null;
    }

    // Ensure at least one field is being updated
    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update the link
    const { data: updatedLink, error: updateError } = await sbAdmin
      .from('shortened_links')
      .update(updatePayload)
      .eq('id', linkId)
      .select()
      .single();

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      isPasswordProtected: !!updatedLink.password_hash,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove password protection
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { linkId } = await context.params;

    // Get body for current password verification
    let currentPassword: string | undefined;
    try {
      const body = await request.json();
      currentPassword = body.currentPassword;
    } catch {
      // Body is optional for DELETE, but needed if password is set
    }

    // Get the link and verify ownership
    const { data: link, error: fetchError } = await sbAdmin
      .from('shortened_links')
      .select('id, ws_id, password_hash')
      .eq('id', linkId)
      .single();

    if (fetchError || !link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // Verify user is a member of the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('ws_id', link.ws_id)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If link has a password, verify current password
    if (link.password_hash) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to remove password protection' },
          { status: 400 }
        );
      }

      const isValidPassword = await bcrypt.compare(
        currentPassword,
        link.password_hash
      );
      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 403 }
        );
      }
    }

    // Remove password protection
    const { error: updateError } = await sbAdmin
      .from('shortened_links')
      .update({
        password_hash: null,
        password_hint: null,
      })
      .eq('id', linkId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to remove password protection' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, isPasswordProtected: false });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
