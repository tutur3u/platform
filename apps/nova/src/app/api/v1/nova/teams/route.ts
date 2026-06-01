import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import { withNovaTeamCounts } from '@/lib/nova-teams';

export async function GET(_: NextRequest) {
  try {
    const sbAdmin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;

    const { data, error, count } = await sbAdmin
      .schema('private')
      .from('nova_teams')
      .select('*', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const transformedData = await withNovaTeamCounts(sbAdmin, data ?? []);

    return NextResponse.json({ data: transformedData, count });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sbAdmin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;
    const privateDb = sbAdmin.schema('private');

    const { name } = (await request.json()) as {
      name: string;
    };

    if (!name) {
      return NextResponse.json(
        { error: 'Team name is required' },
        { status: 400 }
      );
    }

    const { data: existingTeam, error: checkError } = await privateDb
      .from('nova_teams')
      .select('id')
      .eq('name', name.trim())
      .maybeSingle();

    if (checkError) {
      console.error('Error checking team name:', checkError);
      return NextResponse.json(
        { error: 'Error checking team name' },
        { status: 500 }
      );
    }

    // team already exists
    if (existingTeam) {
      return NextResponse.json(
        { error: 'A team with this name already exists' },
        { status: 409 }
      );
    }

    // If team already exists, return conflict error
    const { data: team, error: teamError } = await privateDb
      .from('nova_teams')
      .insert({ name })
      .select()
      .single();

    if (teamError) {
      throw teamError;
    }

    return NextResponse.json({
      data: {
        ...team,
      },
    });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    );
  }
}
