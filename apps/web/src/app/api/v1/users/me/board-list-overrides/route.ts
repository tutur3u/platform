import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

const upsertSchema = z.object({
  scope_type: z.enum(['board', 'list']),
  board_id: z.string().uuid().nullable().optional(),
  list_id: z.string().uuid().nullable().optional(),
  personal_status: z.enum(['not_started', 'in_progress', 'done', 'closed']),
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { data: authData, error: authError } = await authorizeRequest(req);
    if (authError || !authData)
      return (
        authError ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

    const { user, supabase } = authData;

    const { data, error } = await (supabase as any)
      .from('user_board_list_overrides')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching board/list overrides:', error);
      return NextResponse.json(
        { error: 'Failed to fetch overrides' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Error in board-list-overrides GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { data: authData, error: authError } = await authorizeRequest(req);
    if (authError || !authData)
      return (
        authError ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

    const { user, supabase } = authData;

    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { scope_type, board_id, list_id, personal_status, notes } =
      parsed.data;

    // Validate scope_type matches provided IDs
    if (scope_type === 'board' && !board_id) {
      return NextResponse.json(
        { error: 'board_id required when scope_type is board' },
        { status: 400 }
      );
    }
    if (scope_type === 'list' && !list_id) {
      return NextResponse.json(
        { error: 'list_id required when scope_type is list' },
        { status: 400 }
      );
    }

    // Check if override already exists for this user + scope
    let existingQuery = (supabase as any)
      .from('user_board_list_overrides')
      .select('id')
      .eq('user_id', user.id)
      .eq('scope_type', scope_type);

    if (scope_type === 'board') {
      existingQuery = existingQuery.eq('board_id', board_id);
    } else {
      existingQuery = existingQuery.eq('list_id', list_id);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    let data: any;
    let error: any;

    if (existing) {
      // Update existing
      const result = await (supabase as any)
        .from('user_board_list_overrides')
        .update({ personal_status, notes })
        .eq('id', existing.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new
      const result = await (supabase as any)
        .from('user_board_list_overrides')
        .insert({
          user_id: user.id,
          scope_type,
          board_id: scope_type === 'board' ? board_id : null,
          list_id: scope_type === 'list' ? list_id : null,
          personal_status,
          notes,
        })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error upserting board/list override:', error);
      return NextResponse.json(
        { error: 'Failed to save override' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in board-list-overrides PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { data: authData, error: authError } = await authorizeRequest(req);
    if (authError || !authData)
      return (
        authError ||
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

    const { user, supabase } = authData;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || !validate(id)) {
      return NextResponse.json(
        { error: 'Valid override id is required' },
        { status: 400 }
      );
    }

    const { error } = await (supabase as any)
      .from('user_board_list_overrides')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting board/list override:', error);
      return NextResponse.json(
        { error: 'Failed to delete override' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in board-list-overrides DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
