import { MAX_SHORT_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const calendarSettingsSchema = z.object({
  timezone: z.string().max(MAX_SHORT_TEXT_LENGTH).optional(),
  first_day_of_week: z
    .enum(['auto', 'sunday', 'monday', 'saturday'])
    .optional(),
  time_format: z.enum(['auto', '12h', '24h']).optional(),
});

const CALENDAR_SETTINGS_APP_SESSION_AUTH = {
  targetApp: 'calendar',
} as const;

export const GET = withSessionAuth(
  async (_req, { supabase, user }) => {
    try {
      // Fetch user calendar settings
      const { data: userData, error } = await supabase
        .from('user_private_details')
        .select('timezone, first_day_of_week, time_format')
        .eq('user_id', user.id)
        .single();

      if (error) {
        serverLogger.error('Error fetching user calendar settings:', error);
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
      serverLogger.error('Error in user calendar settings API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: CALENDAR_SETTINGS_APP_SESSION_AUTH }
);

export const PATCH = withSessionAuth(
  async (req: NextRequest, { supabase, user }) => {
    try {
      // Parse and validate request body
      const body = await req.json();
      const validatedData = calendarSettingsSchema.parse(body);

      const updateData: z.infer<typeof calendarSettingsSchema> = {};
      if (validatedData.timezone !== undefined) {
        updateData.timezone = validatedData.timezone;
      }
      if (validatedData.first_day_of_week !== undefined) {
        updateData.first_day_of_week = validatedData.first_day_of_week;
      }
      if (validatedData.time_format !== undefined) {
        updateData.time_format = validatedData.time_format;
      }

      // Update user calendar settings
      const { data, error } = await supabase
        .from('user_private_details')
        .update(updateData)
        .eq('user_id', user.id)
        .select('timezone, first_day_of_week, time_format')
        .single();

      if (error) {
        serverLogger.error('Error updating user calendar settings:', error);
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

      serverLogger.error('Error in user calendar settings API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: CALENDAR_SETTINGS_APP_SESSION_AUTH }
);
