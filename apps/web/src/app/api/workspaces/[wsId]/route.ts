import { createClient } from '@tuturuuu/supabase/next/server';
import { workspaceSlugSchema } from '@tuturuuu/utils/slug-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Error fetching user' },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, slug, created_at, workspace_members!inner(role)')
    .eq('id', id)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error || !data?.workspace_members[0]?.role)
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );

  return NextResponse.json({
    ...data,
    role: data.workspace_members[0].role,
  });
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const body = await req.json();
  const { name, slug } = body;

  // Validate slug if provided
  if (slug !== undefined) {
    try {
      workspaceSlugSchema.parse(slug);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { message: error.errors[0]?.message || 'Invalid slug format' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { message: 'Invalid slug format' },
        { status: 400 }
      );
    }

    // Check if slug is already taken by another workspace
    const { data: existingWorkspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('slug', slug)
      .neq('id', id)
      .maybeSingle();

    if (existingWorkspace) {
      return NextResponse.json(
        { message: 'This slug is already taken' },
        { status: 409 }
      );
    }
  }

  // Build update object with only provided fields
  const updateData: { name?: string; slug?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (slug !== undefined) updateData.slug = slug;

  const { data, error } = await supabase
    .from('workspaces')
    .update(updateData)
    .eq('id', id)
    .select('slug')
    .single();

  if (error)
    return NextResponse.json(
      { message: 'Error updating workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success', slug: data.slug });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { error } = await supabase.from('workspaces').delete().eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
