import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const initiativeStatusSchema = z.enum([
  'active',
  'completed',
  'on_hold',
  'cancelled',
]);

const createInitiativeSchema = z.object({
  name: z
    .string()
    .min(1, 'Initiative name is required')
    .max(255, 'Initiative name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  status: initiativeStatusSchema.optional(),
});

type InitiativeRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  created_at: string;
  creator: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  task_project_initiatives:
    | {
        project_id: string;
        project: {
          id: string;
          name: string;
          status: string | null;
        } | null;
      }[]
    | null;
};

const serializeInitiatives = (rows: InitiativeRow[]) =>
  rows.map((initiative) => ({
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
    status: initiative.status,
    created_at: initiative.created_at,
    creator: initiative.creator,
    projectsCount: initiative.task_project_initiatives?.length ?? 0,
    linkedProjects:
      initiative.task_project_initiatives?.flatMap((link) =>
        link.project ? [link.project] : []
      ) ?? [],
  }));

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: initiatives, error } = await supabase
      .from('task_initiatives')
      .select(
        `
          *,
          creator:users!task_initiatives_creator_id_fkey(
            id,
            display_name,
            avatar_url
          ),
          task_project_initiatives(
            project_id,
            project:task_projects(
              id,
              name,
              status
            )
          )
        `
      )
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching task initiatives:', error);
      return NextResponse.json(
        { error: 'Failed to fetch initiatives' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      serializeInitiatives((initiatives ?? []) as InitiativeRow[])
    );
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/task-initiatives:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, status } = createInitiativeSchema.parse(body);

    const { data: initiative, error } = await supabase
      .from('task_initiatives')
      .insert({
        name,
        description: description || null,
        status: status ?? 'active',
        ws_id: wsId,
        creator_id: user.id,
      })
      .select('*')
      .single();

    if (error || !initiative) {
      console.error('Error creating task initiative:', error);
      return NextResponse.json(
        { error: 'Failed to create initiative' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: initiative.id,
        name: initiative.name,
        description: initiative.description,
        status: initiative.status,
        created_at: initiative.created_at,
        creator: null,
        projectsCount: 0,
        linkedProjects: [],
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-initiatives:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
