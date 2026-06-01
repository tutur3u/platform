import { type NextRequest, NextResponse } from 'next/server';
import { authorizeNovaRoleManager } from '@/lib/nova-team-api-auth';
import { withNovaTeamCounts } from '@/lib/nova-teams';

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeNovaRoleManager(request);
    if (!authorization.ok) return authorization.response;

    const { data, error, count } = await authorization.value.privateDb
      .from('nova_teams')
      .select('*', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const transformedData = await withNovaTeamCounts(
      authorization.value.sbAdmin,
      data ?? []
    );

    return NextResponse.json({ data: transformedData, count });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeNovaRoleManager(request);
    if (!authorization.ok) return authorization.response;

    const { privateDb } = authorization.value;

    const { name } = (await request.json()) as {
      name: string;
    };

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Team name is required' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    const { data: existingTeam, error: checkError } = await privateDb
      .from('nova_teams')
      .select('id')
      .eq('name', trimmedName)
      .maybeSingle();

    if (checkError) {
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
      .insert({ name: trimmedName })
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
  } catch {
    return NextResponse.json(
      { error: 'Failed to create team' },
      { status: 500 }
    );
  }
}
