import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const toggleFavoriteSchema = z.object({
  modelId: z.string().min(1),
  isFavorited: z.boolean(),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('ai_model_favorites')
    .select('model_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching AI model favorites:', error);
    return NextResponse.json(
      { message: 'Failed to fetch AI model favorites' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    favoriteIds: (data ?? []).map((row) => row.model_id),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const parsed = toggleFavoriteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { modelId, isFavorited } = parsed.data;

  if (isFavorited) {
    const { error } = await supabase
      .from('ai_model_favorites')
      .delete()
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .eq('model_id', modelId);

    if (error) {
      console.error('Error removing AI model favorite:', error);
      return NextResponse.json(
        { message: 'Failed to update AI model favorites' },
        { status: 500 }
      );
    }
  } else {
    const { error } = await supabase.from('ai_model_favorites').insert({
      ws_id: wsId,
      user_id: user.id,
      model_id: modelId,
    });

    if (error) {
      console.error('Error adding AI model favorite:', error);
      return NextResponse.json(
        { message: 'Failed to update AI model favorites' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
