import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';

interface Params {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { sessionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: session, error } = await supabase
      .schema('private')
      .from('nova_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Session not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching session' },
        { status: 500 }
      );
    }

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { sessionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    startTime?: string;
    endTime?: string;
    status?: string;
    challengeId?: string;
  };

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Check if any update data was provided
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { message: 'No update data provided' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (body.startTime !== undefined) updateData.start_time = body.startTime;
    if (body.endTime !== undefined) updateData.end_time = body.endTime;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.challengeId !== undefined)
      updateData.challenge_id = body.challengeId;
    updateData.user_id = user.id;

    const { data: updatedSession, error: updateError } = await supabase
      .schema('private')
      .from('nova_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('Database Error: ', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Session not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error updating session' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedSession, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createAdminClient({ noCookie: true });
  const { sessionId } = await params;
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { error: deleteError } = await supabase
      .schema('private')
      .from('nova_sessions')
      .delete()
      .eq('id', sessionId);

    if (deleteError) {
      console.error('Database Error: ', deleteError);
      return NextResponse.json(
        { message: 'Error deleting session' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Session deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
