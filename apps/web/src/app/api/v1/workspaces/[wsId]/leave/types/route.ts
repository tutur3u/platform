import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createLeaveTypeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().nullable().optional(),
  color: z.string().default('#3b82f6'),
  icon: z.string().default('calendar-days'),
  is_paid: z.boolean().default(true),
  requires_approval: z.boolean().default(true),
  allow_half_days: z.boolean().default(true),
  accrual_rate_days_per_month: z.number().min(0).max(99.99).default(0),
  max_balance_days: z.number().min(0).max(9999.99).nullable().optional(),
  max_carryover_days: z.number().min(0).max(9999.99).default(0),
  is_tet_leave: z.boolean().default(false),
  is_wedding_leave: z.boolean().default(false),
  is_funeral_leave: z.boolean().default(false),
  category: z
    .enum(['standard', 'parental', 'special', 'custom'])
    .default('custom'),
  is_active: z.boolean().default(true),
  display_order: z.number().int().default(0),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const searchParams = req.nextUrl.searchParams;
  const category = searchParams.get('category');
  const isActive = searchParams.get('isActive');

  const permissions = await getPermissions({ wsId: normalizedWsId });

  // All workspace members can view leave types
  const hasAnyPermission = permissions.permissions.length > 0;

  if (!hasAnyPermission) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = await createClient();

  let query = supabase
    .from('leave_types')
    .select('*')
    .eq('ws_id', normalizedWsId);

  if (
    category &&
    ['standard', 'parental', 'special', 'custom'].includes(category)
  ) {
    query = query.eq(
      'category',
      category as 'standard' | 'parental' | 'special' | 'custom'
    );
  }

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true');
  }

  query = query.order('display_order', { ascending: true });
  query = query.order('name', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching leave types:', error);
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
  const validation = createLeaveTypeSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get current user for created_by field
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('leave_types')
    .insert({
      ws_id: normalizedWsId,
      created_by: user.id,
      ...validation.data,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating leave type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
