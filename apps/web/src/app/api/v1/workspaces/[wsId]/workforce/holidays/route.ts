import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createHolidaySchema = z.object({
  name: z.string().min(1),
  holiday_date: z.string(),
  is_recurring: z.boolean().default(false),
  overtime_multiplier: z.number().min(1).max(10).default(3.0),
  country_code: z.string().default('VN'),
  notes: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const year = searchParams.get('year');
  const countryCode = searchParams.get('countryCode');

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view holidays
  const isMember = permissions.workspaceMembers.some(
    (m) => m.user_id === permissions.currentUser?.id
  );

  if (!isMember) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  let query = supabase
    .from('workspace_holidays')
    .select('*')
    .eq('ws_id', normalizedWsId);

  if (year) {
    // Filter by year
    query = query.gte('holiday_date', `${year}-01-01`);
    query = query.lte('holiday_date', `${year}-12-31`);
  }

  if (countryCode) {
    query = query.eq('country_code', countryCode);
  }

  query = query.order('holiday_date', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching holidays:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const permissions = await getPermissions({ wsId: normalizedWsId });
  if (!permissions.containsPermission('manage_workforce')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const validation = createHolidaySchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_holidays')
    .insert({
      ws_id: normalizedWsId,
      ...validation.data,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating holiday:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
