import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().uuid(),
});

const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  icon: z.string().nullable().optional(),
  template_id: z.string().uuid().optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { wsId } = paramsSchema.parse(await params);
    const supabase = await createClient(req);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('workspace_boards')
      .select('*')
      .eq('ws_id', wsId)
      .order('name', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch workspace boards' },
        { status: 500 }
      );
    }

    return NextResponse.json({ boards: data ?? [] });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { wsId } = paramsSchema.parse(await params);
    const supabase = await createClient(req);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const parsedBody = createBoardSchema.parse(await req.json());

    const insertPayload: Database['public']['Tables']['workspace_boards']['Insert'] =
      {
        ws_id: wsId,
        name: parsedBody.name || 'Untitled Board',
        icon:
          (parsedBody.icon as
            | Database['public']['Enums']['platform_icon']
            | null
            | undefined) ?? null,
        template_id: parsedBody.template_id,
        creator_id: user.id,
      };

    const { data, error } = await supabase
      .from('workspace_boards')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create workspace board' },
        { status: 500 }
      );
    }

    return NextResponse.json({ board: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
