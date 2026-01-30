/**
 * Vietnamese Holiday API (single item)
 *
 * PUT: Update holiday (admin only)
 * DELETE: Delete holiday (admin only)
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    holidayId: string;
  }>;
}

const updateHolidaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  name: z.string().min(1).max(100).optional(),
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
 * PUT: Update holiday
 */
export async function PUT(req: Request, { params }: Params) {
  const adminCheck = await isAdmin();
  if (!adminCheck) {
    return NextResponse.json(
      { message: 'Admin access required' },
      { status: 403 }
    );
  }

  const { holidayId } = await params;

  // Validate input
  const body = await req.json();
  const parseResult = updateHolidaySchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { message: 'Invalid input', errors: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const updates = parseResult.data;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { message: 'No updates provided' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Check if holiday exists
  const { data: existing, error: fetchError } = await supabase
    .from('vietnamese_holidays')
    .select('id')
    .eq('id', holidayId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ message: 'Holiday not found' }, { status: 404 });
  }

  // If changing date, check for conflicts
  if (updates.date) {
    const { data: conflict } = await supabase
      .from('vietnamese_holidays')
      .select('id')
      .eq('date', updates.date)
      .neq('id', holidayId)
      .single();

    if (conflict) {
      return NextResponse.json(
        { message: 'A holiday already exists for this date' },
        { status: 409 }
      );
    }
  }

  // Update holiday
  const { data: holiday, error } = await supabase
    .from('vietnamese_holidays')
    .update(updates)
    .eq('id', holidayId)
    .select()
    .single();

  if (error) {
    console.error('Error updating holiday:', error);
    return NextResponse.json(
      { message: 'Error updating holiday' },
      { status: 500 }
    );
  }

  return NextResponse.json(holiday);
}

/**
 * DELETE: Delete holiday
 */
export async function DELETE(_: Request, { params }: Params) {
  const adminCheck = await isAdmin();
  if (!adminCheck) {
    return NextResponse.json(
      { message: 'Admin access required' },
      { status: 403 }
    );
  }

  const { holidayId } = await params;
  const supabase = await createClient();

  const { error } = await supabase
    .from('vietnamese_holidays')
    .delete()
    .eq('id', holidayId);

  if (error) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json(
      { message: 'Error deleting holiday' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Holiday deleted' });
}
