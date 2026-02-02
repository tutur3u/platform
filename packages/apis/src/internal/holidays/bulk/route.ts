/**
 * Vietnamese Holidays Bulk Import API
 *
 * POST: Bulk import holidays (admin only)
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const bulkImportSchema = z.object({
  holidays: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().min(1).max(100),
      })
    )
    .min(1)
    .max(100),
  replaceExisting: z.boolean().optional().default(false),
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
 * POST: Bulk import holidays
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
  const parseResult = bulkImportSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { message: 'Invalid input', errors: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { holidays, replaceExisting } = parseResult.data;
  const supabase = await createClient();

  // Get unique years from import data
  const yearsToReplace = replaceExisting
    ? [...new Set(holidays.map((h) => parseInt(h.date.substring(0, 4), 10)))]
    : [];

  // If replaceExisting, delete existing holidays for those years
  if (replaceExisting && yearsToReplace.length > 0) {
    const { error: deleteError } = await supabase
      .from('vietnamese_holidays')
      .delete()
      .in('year', yearsToReplace);

    if (deleteError) {
      console.error('Error deleting existing holidays:', deleteError);
      return NextResponse.json(
        { message: 'Error deleting existing holidays' },
        { status: 500 }
      );
    }
  }

  // Insert new holidays (upsert to handle conflicts)
  const { data: insertedHolidays, error: insertError } = await supabase
    .from('vietnamese_holidays')
    .upsert(
      holidays.map((h) => ({ date: h.date, name: h.name })),
      { onConflict: 'date', ignoreDuplicates: !replaceExisting }
    )
    .select();

  if (insertError) {
    console.error('Error inserting holidays:', insertError);
    return NextResponse.json(
      { message: 'Error inserting holidays' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      message: 'Holidays imported successfully',
      imported: insertedHolidays?.length || 0,
      yearsAffected:
        yearsToReplace.length > 0
          ? yearsToReplace
          : [
              ...new Set(
                holidays.map((h) => parseInt(h.date.substring(0, 4), 10))
              ),
            ],
    },
    { status: 201 }
  );
}
