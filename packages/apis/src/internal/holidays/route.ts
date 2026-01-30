/**
 * Vietnamese Holidays API
 *
 * GET: List all holidays (with optional year filter)
 * POST: Add new holiday (admin only)
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(100),
});

/**
 * Check if user is admin (member of ROOT workspace)
 */
async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .single();

  return !!data;
}

/**
 * GET: List all holidays
 *
 * Query params:
 * - year: Filter by year (optional)
 */
export async function GET(req: Request) {
  const supabase = await createClient();

  // Parse query params
  const url = new URL(req.url);
  const yearStr = url.searchParams.get('year');
  const year = yearStr ? parseInt(yearStr, 10) : null;

  // Build query
  let query = supabase
    .from('vietnamese_holidays')
    .select('*')
    .order('date', { ascending: true });

  if (year && !Number.isNaN(year)) {
    query = query.eq('year', year);
  }

  const { data: holidays, error } = await query;

  if (error) {
    console.error('Error fetching holidays:', error);
    return NextResponse.json(
      { message: 'Error fetching holidays' },
      { status: 500 }
    );
  }

  return NextResponse.json(holidays);
}

/**
 * POST: Add new holiday (admin only)
 */
export async function POST(req: Request) {
  const adminCheck = await isAdmin();
  if (!adminCheck) {
    return NextResponse.json(
      { message: 'Admin access required' },
      { status: 403 }
    );
  }

  // Validate input
  const body = await req.json();
  const parseResult = createHolidaySchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { message: 'Invalid input', errors: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { date, name } = parseResult.data;
  const supabase = await createClient();

  // Check if date already exists
  const { data: existing } = await supabase
    .from('vietnamese_holidays')
    .select('id')
    .eq('date', date)
    .single();

  if (existing) {
    return NextResponse.json(
      { message: 'A holiday already exists for this date' },
      { status: 409 }
    );
  }

  // Create holiday
  const { data: holiday, error } = await supabase
    .from('vietnamese_holidays')
    .insert({ date, name })
    .select()
    .single();

  if (error) {
    console.error('Error creating holiday:', error);
    return NextResponse.json(
      { message: 'Error creating holiday' },
      { status: 500 }
    );
  }

  return NextResponse.json(holiday, { status: 201 });
}
