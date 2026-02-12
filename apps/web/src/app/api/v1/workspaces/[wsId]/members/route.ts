import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import {
  assignSeatToMember,
  revokeSeatFromMember,
} from '@/utils/polar-seat-helper';
import { enforceSeatLimit } from '@/utils/seat-limits';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { wsId } = await params;

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey(req, { wsId, apiKey })
    : getDataFromSession(req, { wsId });
}

async function getDataWithApiKey(
  req: NextRequest,
  {
    wsId,
    apiKey,
  }: {
    wsId: string;
    apiKey: string;
  }
) {
  const sbAdmin = await createAdminClient();

  const apiCheckQuery = sbAdmin
    .from('workspace_api_keys')
    .select('id')
    .eq('ws_id', wsId)
    .eq('value', apiKey)
    .single();

  const mainQuery = sbAdmin
    .from('workspace_members')
    .select('*, ...user_private_details(email), ...users(display_name)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get('q');

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = searchParams.get('limit');

  console.log({ query, from, to, limit });

  if (query) mainQuery.textSearch('full_name', query);
  if (from && to) mainQuery.range(parseInt(from, 10), parseInt(to, 10));
  if (limit) mainQuery.limit(parseInt(limit, 10));

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  const { error: apiError } = apiCheck;

  if (apiError) {
    console.log(apiError);
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, count, error } = response;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, count });
}

async function getDataFromSession(
  req: NextRequest,
  { wsId }: { wsId: string }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { error: userError } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('user_id', user.id)
    .eq('ws_id', wsId)
    .single();

  if (userError) {
    console.log(userError);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  const sbAdmin = await createAdminClient();

  const mainQuery = sbAdmin
    .from('workspace_members')
    .select('*, ...users(id, display_name, ...user_private_details(email))')
    .eq('ws_id', wsId);

  const searchParams = new URLSearchParams(req.nextUrl.search);
  const query = searchParams.get('query');

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = searchParams.get('limit');

  if (query) mainQuery.textSearch('full_name', query);
  if (from && to) mainQuery.range(parseInt(from, 10), parseInt(to, 10));
  if (limit) mainQuery.limit(parseInt(limit, 10));

  const { data, error } = await mainQuery;

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();
  const data = await req.json();
  const { wsId } = await params;

  // Validate that we have a user_id
  if (!data.user_id) {
    return NextResponse.json(
      { message: 'Missing user_id in request body' },
      { status: 400 }
    );
  }

  // Check seat limit BEFORE adding member
  const seatCheck = await enforceSeatLimit(sbAdmin, wsId);
  if (!seatCheck.allowed) {
    return NextResponse.json(
      {
        message: 'SEAT_LIMIT_REACHED',
        error: seatCheck.message,
        seatStatus: seatCheck.status,
      },
      { status: 403 }
    );
  }

  // Pre-check: verify the user has a pending invite before making Polar API calls.
  // The supabase.insert below is RLS-enforced and would fail anyway, but checking
  // early avoids an unnecessary Polar seat assignment + rollback round-trip.
  const { data: hasInvite } = await sbAdmin
    .from('workspace_invites')
    .select('id')
    .eq('ws_id', wsId)
    .eq('user_id', data.user_id)
    .maybeSingle();

  if (!hasInvite) {
    return NextResponse.json(
      { message: 'User does not have a pending invite for this workspace' },
      { status: 403 }
    );
  }

  // Assign Polar seat BEFORE adding member (if seat-based subscription)
  const polar = createPolarClient();
  const seatAssignment = await assignSeatToMember(
    polar,
    sbAdmin,
    wsId,
    data.user_id
  );
  if (seatAssignment.required && !seatAssignment.success) {
    return NextResponse.json(
      {
        message: 'POLAR_SEAT_ASSIGNMENT_FAILED',
        error: seatAssignment.error,
      },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('workspace_members').insert({
    ...data,
    ws_id: wsId,
  });

  if (error) {
    // Rollback: revoke the Polar seat if it was assigned
    if (seatAssignment.required && seatAssignment.success) {
      await revokeSeatFromMember(polar, sbAdmin, wsId, data.user_id);
    }

    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
