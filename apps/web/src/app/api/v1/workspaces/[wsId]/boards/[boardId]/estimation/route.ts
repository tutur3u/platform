import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

// PATCH - Update board estimation type
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, boardId } = await params;
    const body = await request.json();
    const {
      estimation_type,
      extended_estimation,
      allow_zero_estimates,
      count_unestimated_issues,
    } = body;

    // Validate estimation type
    const validEstimationTypes = [
      'exponential',
      'fibonacci',
      'linear',
      't-shirt',
      null,
    ];
    if (
      estimation_type !== null &&
      !validEstimationTypes.includes(estimation_type)
    ) {
      return NextResponse.json(
        { error: 'Invalid estimation type' },
        { status: 400 }
      );
    }

    // Validate extended_estimation (should be boolean or undefined)
    if (
      extended_estimation !== undefined &&
      typeof extended_estimation !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'Invalid extended_estimation value' },
        { status: 400 }
      );
    }

    // Validate allow_zero_estimates (should be boolean or undefined)
    if (
      allow_zero_estimates !== undefined &&
      typeof allow_zero_estimates !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'Invalid allow_zero_estimates value' },
        { status: 400 }
      );
    }

    // Validate count_unestimated_issues (should be boolean or undefined)
    if (
      count_unestimated_issues !== undefined &&
      typeof count_unestimated_issues !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'Invalid count_unestimated_issues value' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify the board exists and belongs to the workspace
    const { data: existingBoard } = await supabase
      .from('workspace_boards')
      .select('id, ws_id')
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (!existingBoard) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Update the board estimation type
    const updateData: any = {
      estimation_type: estimation_type,
    };

    // Only include extended_estimation if it's provided
    if (extended_estimation !== undefined) {
      updateData.extended_estimation = extended_estimation;
    }

    // Only include allow_zero_estimates if it's provided
    if (allow_zero_estimates !== undefined) {
      updateData.allow_zero_estimates = allow_zero_estimates;
    }

    // Only include count_unestimated_issues if it's provided
    if (count_unestimated_issues !== undefined) {
      updateData.count_unestimated_issues = count_unestimated_issues;
    }

    const { data: updatedBoard, error: updateError } = await supabase
      .from('workspace_boards')
      .update(updateData)
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .select(
        'id, name, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, created_at'
      )
      .single();

    if (updateError) {
      console.error('Error updating board estimation type:', updateError);
      return NextResponse.json(
        { error: 'Failed to update estimation type' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedBoard);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
