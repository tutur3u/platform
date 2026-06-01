import { type NextRequest, NextResponse } from 'next/server';
import {
  authorizeNovaEnabledUser,
  authorizeNovaRoleManager,
  authorizeNovaTeamProfileEditor,
} from '@/lib/nova-team-api-auth';
import { withNovaTeamCounts } from '@/lib/nova-teams';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = await authorizeNovaEnabledUser(request);
    if (!authorization.ok) return authorization.response;

    const { id } = await params;

    const { data, error } = await authorization.value.privateDb
      .from('nova_teams')
      .select('id, name, description, goals, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const [transformedData] = await withNovaTeamCounts(
      authorization.value.sbAdmin,
      [data]
    );

    return NextResponse.json({ data: transformedData });
  } catch (error: any) {
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
      const name = payload.name.trim();

      if (!name) {
        return NextResponse.json(
          { error: 'Team name is required' },
          { status: 400 }
        );
      }

      updatePayload.name = name;
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

    const authorization =
      'name' in updatePayload
        ? await authorizeNovaRoleManager(request)
        : await authorizeNovaTeamProfileEditor(request, id);

    if (!authorization.ok) return authorization.response;

    const { privateDb } = authorization.value;

    const { data, error } = await privateDb
      .from('nova_teams')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = await authorizeNovaRoleManager(request);
    if (!authorization.ok) return authorization.response;

    const { privateDb } = authorization.value;

    const { id } = await params;

    const { data: existingTeam, error: teamError } = await privateDb
      .from('nova_teams')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (teamError || !existingTeam) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const { error } = await privateDb.from('nova_teams').delete().eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || 'Failed to delete team',
      },
      { status: 500 }
    );
  }
}
