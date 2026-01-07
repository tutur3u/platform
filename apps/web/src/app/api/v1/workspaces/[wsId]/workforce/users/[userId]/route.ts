import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateContractSchema = z.object({
  contract_id: z.string().uuid(),
  contract_type: z
    .enum(['full_time', 'part_time', 'contractor', 'intern', 'temporary'])
    .optional(),
  employment_status: z
    .enum(['active', 'on_leave', 'terminated', 'rehired'])
    .optional(),
  job_title: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  working_location: z.string().optional().nullable(),
  start_date: z.string().optional(),
  end_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wsId: string; userId: string }> }
) {
  try {
    const { wsId, userId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for view_workforce or manage_workforce permission
    const { containsPermission } = await getPermissions({
      wsId: normalizedWsId,
    });

    // Also allow users to view their own profile
    const { data: isLinkedUser } = await supabase
      .from('workspace_user_linked_users')
      .select('virtual_user_id')
      .eq('platform_user_id', user.id)
      .eq('virtual_user_id', userId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    if (
      !containsPermission('view_workforce') &&
      !containsPermission('manage_workforce') &&
      !isLinkedUser
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get user with contracts, compensation, and benefits
    const { data: workspaceUser, error: userError } = await supabase
      .from('workspace_users')
      .select(
        `
        *,
        workforce_contracts (
          *,
          workforce_compensation (*),
          workforce_benefits (*)
        )
      `
      )
      .eq('id', userId)
      .eq('ws_id', normalizedWsId)
      .single();

    if (userError) {
      if (userError.code === 'PGRST116') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      console.error('Error fetching workforce user:', userError);
      return NextResponse.json(
        { error: 'Failed to fetch user' },
        { status: 500 }
      );
    }

    // Get linked platform user info if available
    const { data: linkedUser } = await supabase
      .from('workspace_user_linked_users')
      .select('platform_user_id')
      .eq('virtual_user_id', userId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    let platformUser = null;
    if (linkedUser?.platform_user_id) {
      const { data } = await supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .eq('id', linkedUser.platform_user_id)
        .single();
      platformUser = data;
    }

    // Find current active contract
    const contracts = workspaceUser.workforce_contracts || [];
    const currentContract =
      contracts.find(
        (c: any) => !c.end_date || new Date(c.end_date) >= new Date()
      ) || null;

    return NextResponse.json({
      ...workspaceUser,
      platform_user: platformUser,
      current_contract: currentContract,
      contracts_count: contracts.length,
    });
  } catch (error) {
    console.error('Error in workforce user GET API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; userId: string }> }
) {
  try {
    const { wsId, userId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const body = await req.json();

    const result = updateContractSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: result.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for manage_workforce permission
    const { containsPermission } = await getPermissions({
      wsId: normalizedWsId,
    });

    if (!containsPermission('manage_workforce')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build update data
    const updateData: Record<string, any> = {};
    if (result.data.contract_type !== undefined)
      updateData.contract_type = result.data.contract_type;
    if (result.data.employment_status !== undefined)
      updateData.employment_status = result.data.employment_status;
    if (result.data.job_title !== undefined)
      updateData.job_title = result.data.job_title;
    if (result.data.department !== undefined)
      updateData.department = result.data.department;
    if (result.data.working_location !== undefined)
      updateData.working_location = result.data.working_location;
    if (result.data.start_date !== undefined)
      updateData.start_date = result.data.start_date;
    if (result.data.end_date !== undefined)
      updateData.end_date = result.data.end_date;
    if (result.data.notes !== undefined) updateData.notes = result.data.notes;

    const { data: contract, error: updateError } = await supabase
      .from('workforce_contracts')
      .update(updateData)
      .eq('id', result.data.contract_id)
      .eq('user_id', userId)
      .eq('ws_id', normalizedWsId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating contract:', updateError);
      return NextResponse.json(
        { error: 'Failed to update contract' },
        { status: 500 }
      );
    }

    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error in workforce user PATCH API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string; userId: string }> }
) {
  try {
    const { wsId, userId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const contractId = req.nextUrl.searchParams.get('contract_id');

    if (!contractId) {
      return NextResponse.json(
        { error: 'contract_id query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for manage_workforce permission
    const { containsPermission } = await getPermissions({
      wsId: normalizedWsId,
    });

    if (!containsPermission('manage_workforce')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete the contract
    const { error: deleteError } = await supabase
      .from('workforce_contracts')
      .delete()
      .eq('id', contractId)
      .eq('user_id', userId)
      .eq('ws_id', normalizedWsId);

    if (deleteError) {
      console.error('Error deleting contract:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete contract' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in workforce user DELETE API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
