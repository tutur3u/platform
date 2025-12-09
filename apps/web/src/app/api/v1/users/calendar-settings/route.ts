import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const calendarSettingsSchema = z.object({
  timezone: z.string().optional(),
  first_day_of_week: z
    .enum(['auto', 'sunday', 'monday', 'saturday'])
    .optional(),
  time_format: z.enum(['auto', '12h', '24h']).optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch user calendar settings
    const { data: userData, error } = await supabase
      .from('users')
      .select('timezone, first_day_of_week, time_format')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user calendar settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user calendar settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: userData.timezone || 'auto',
      first_day_of_week: userData.first_day_of_week || 'auto',
      time_format: userData.time_format || 'auto',
    });
  } catch (error) {
    console.error('Error in user calendar settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = calendarSettingsSchema.parse(body);

    // Update user calendar settings
    const { data, error } = await supabase
      .from('users')
      .update({
        timezone: validatedData.timezone,
        first_day_of_week: validatedData.first_day_of_week,
        time_format: validatedData.time_format,
      })
      .eq('id', user.id)
      .select('timezone, first_day_of_week, time_format')
      .single();

    if (error) {
      console.error('Error updating user calendar settings:', error);
      return NextResponse.json(
        { error: 'Failed to update user calendar settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: data.timezone || 'auto',
      first_day_of_week: data.first_day_of_week || 'auto',
      time_format: data.time_format || 'auto',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in user calendar settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
