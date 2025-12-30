import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const CreateUserSchema = z.object({
  full_name: z.string().optional(),
  display_name: z.string().optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthday: z.string().optional(), // ISO string format expected
  ethnicity: z.string().optional(),
  guardian: z.string().optional(),
  national_id: z.string().optional(),
  address: z.string().optional(),
  note: z.string().optional(),
  is_guest: z.boolean().optional(),
});

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
    .from('workspace_users')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true })
    .order('display_name', { ascending: true });

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

  const mainQuery = supabase
    .from('workspace_users')
    .select('*')
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
  const { wsId } = await params;
  // Check permissions
  const { containsPermission } = await getPermissions({ wsId });
  if (!containsPermission('create_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to create users' },
      { status: 403 }
    );
  }

  // Validate request body
  const rawData = await req.json();
  const validationResult = CreateUserSchema.safeParse(rawData);

  if (!validationResult.success) {
    return NextResponse.json(
      {
        message: 'Invalid request body',
        errors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const data = validationResult.data;

  const supabase = await createClient();
  // Separate control flags from user payload
  // Do NOT allow archived or archived_until during creation
  const { is_guest, ...userPayload } = data ?? {};

  // Create user and get the new id
  const { data: createdUser, error } = await supabase
    .from('workspace_users')
    .insert({
      ...userPayload,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating workspace user' },
      { status: 500 }
    );
  }

  // If marked as guest, attach the user to the workspace's guest group
  let warning: string | undefined;
  if (is_guest && createdUser?.id) {
    const { data: guestGroup, error: groupError } = await supabase
      .from('workspace_user_groups')
      .select('id')
      .eq('ws_id', wsId)
      .eq('is_guest', true)
      .maybeSingle();

    if (!groupError && guestGroup?.id) {
      // Insert relation; ignore error if already exists
      const { error: linkError } = await supabase
        .from('workspace_user_groups_users')
        .insert({
          group_id: guestGroup.id,
          user_id: createdUser.id,
        });

      if (linkError) {
        console.log(linkError);
        warning = 'User created, but failed to link to guest group.';
      }
    } else {
      warning = 'User created, but no guest group found in this workspace.';
    }
  }

  return NextResponse.json({ message: 'success', warning });
}
