import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, start_time, end_time, dates, is_public } = body;

    const sbAdmin = await createAdminClient();

    // Create the plan with workspace ID
    const { data, error } = await sbAdmin
      .from('meet_together_plans')
      .insert({
        name,
        start_time,
        end_time,
        dates,
        is_public: is_public ?? true,
        creator_id: user.id,
        ws_id: wsId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating meet together plan:', error);
      return NextResponse.json(
        { error: 'Failed to create plan' },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error('Error in POST /tumeet/plans:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Fetch plans for this specific workspace
    const createdPlansQuery = sbAdmin
      .from('meet_together_plans')
      .select('*')
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    const joinedPlansQuery = sbAdmin
      .from('meet_together_user_timeblocks')
      .select('...meet_together_plans(*)')
      .eq('user_id', user.id)
      .eq('meet_together_plans.ws_id', wsId)
      .order('created_at', { ascending: false });

    const [createdPlans, joinedPlans] = await Promise.all([
      createdPlansQuery,
      joinedPlansQuery,
    ]);

    const { data: createdPlanData, error: createdPlansError } = createdPlans;
    const { data: joinedPlanData, error: joinedPlansError } = joinedPlans;

    if (createdPlansError) {
      console.error('Error fetching created plans:', createdPlansError);
      return NextResponse.json(
        { error: 'Failed to fetch created plans' },
        { status: 500 }
      );
    }

    if (joinedPlansError) {
      console.error('Error fetching joined plans:', joinedPlansError);
      return NextResponse.json(
        { error: 'Failed to fetch joined plans' },
        { status: 500 }
      );
    }

    const data = [...createdPlanData, ...joinedPlanData]
      // filter out duplicates
      .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in GET /tumeet/plans:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
