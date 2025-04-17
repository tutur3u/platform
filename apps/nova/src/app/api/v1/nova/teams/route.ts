import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_: NextRequest) {
  try {
    const supabase = await createClient();

    const { data, error, count } = await supabase
      .from('nova_teams')
      .select('*, nova_team_members(count), nova_team_emails(count)', {
        count: 'exact',
      });

    if (error) {
      throw error;
    }

    const transformedData = data.map((team) => ({
      ...team,
      member_count: team.nova_team_members?.[0]?.count || 0,
      invitation_count: team.nova_team_emails?.[0]?.count || 0,
    }));

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
    const supabase = await createClient();

    const { name } = (await request.json()) as {
      name: string;
    };

    if (!name) {
      return NextResponse.json(
        { error: 'Team name is required' },
        { status: 400 }
      );
    }

    const { data: existingTeam, error: checkError } = await supabase
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
    const { data: team, error: teamError } = await supabase
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
