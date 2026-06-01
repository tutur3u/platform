import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { withNovaTeamCounts } from '@/lib/nova-teams';

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sbAdmin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;

    const { id } = await params;

    const { data, error } = await sbAdmin
      .schema('private')
      .from('nova_teams')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const [transformedData] = await withNovaTeamCounts(sbAdmin, [data]);

    return NextResponse.json({ data: transformedData });
  } catch (error: any) {
    console.error('Error fetching team:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch team',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sbAdmin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;
    const privateDb = sbAdmin.schema('private');

    const { id } = await params;
    const payload = (await request.json()) as {
      description?: string | null;
      goals?: string | null;
      name?: string;
    };

    const updatePayload: {
      description?: string | null;
      goals?: string | null;
      name?: string;
    } = {};

    if (typeof payload.name === 'string') {
      updatePayload.name = payload.name;
    }

    if ('description' in payload) {
      updatePayload.description = payload.description ?? null;
    }

    if ('goals' in payload) {
      updatePayload.goals = payload.goals ?? null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No team fields were provided' },
        { status: 400 }
      );
    }
    const { data, error } = await privateDb
      .from('nova_teams')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error updating team:', error);
    return NextResponse.json(
      {
        error: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sbAdmin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;

    const { id } = await params;

    const { error } = await sbAdmin
      .schema('private')
      .from('nova_teams')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting team:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to delete team',
      },
      { status: 500 }
    );
  }
}
