import { createClient } from '@tuturuuu/supabase/next/client';
import dayjs from 'dayjs';

// Const of 4 weeks from the current week, this can be used for startDate and endDate in google calendar background sync
// and check if the current view is within this range
export const BACKGROUND_SYNC_RANGE = 4 * 7;

/**
 * Check if we can proceed with sync (30-second cooldown)
 * @param wsId - Workspace ID
 * @param supabase - Supabase client (optional, will create one if not provided)
 * @returns Promise<boolean> - true if sync can proceed, false if blocked
 */
export const canProceedWithSync = async (
  wsId: string,
  supabase?: any,
  dates?: Date[]
): Promise<boolean> => {
  try {
    // Check if the current view is within the background sync range
    if (!dates) {
      console.log('No dates provided: Can proceed with active sync');
      return true;
    }

    const startDate = dayjs(dates[0]);
    const endDate = dayjs(dates[dates.length - 1]);

    const isWithinRange = isWithinBackgroundSyncRange(startDate, endDate);

    if (!isWithinRange) {
      console.log('Out of background sync range: Can proceed with active sync');
      return true;
    }

    const client = supabase || createClient();

    // Get or create sync coordination record
    const { data: syncRecord, error: fetchError } = await client
      .from('workspace_calendar_sync_coordination')
      .select('last_upsert')
      .eq('ws_id', wsId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found"
      console.error('Error fetching sync coordination:', fetchError);
      return true; // Allow sync if we can't check
    }

    if (!syncRecord) {
      // Create record if it doesn't exist
      const { error: insertError } = await client
        .from('workspace_calendar_sync_coordination')
        .insert({ ws_id: wsId, last_upsert: new Date().toISOString() });

      if (insertError) {
        console.error('Error creating sync coordination record:', insertError);
      }
      return true; // Allow sync for new workspaces
    }

    const lastUpsert = new Date(syncRecord.last_upsert);
    const now = new Date();
    const timeSinceLastUpsert = now.getTime() - lastUpsert.getTime();
    const thirtySeconds = 30 * 1000;

    if (timeSinceLastUpsert < thirtySeconds) {
      const remainingSeconds = Math.round(
        (thirtySeconds - timeSinceLastUpsert) / 1000
      );
      console.log(
        `Sync blocked for wsId ${wsId}: ${remainingSeconds}s remaining`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking sync coordination:', error);
    return true; // Allow sync if we can't check
  }
};

/**
 * Check if a date range is within 4 weeks from the current week
 * @param startDate - Start date to check
 * @param endDate - End date to check
 * @returns boolean - true if within 4 weeks from current week, false otherwise
 */
export const isWithinBackgroundSyncRange = (
  startDate: dayjs.Dayjs,
  endDate: dayjs.Dayjs
): boolean => {
  const now = dayjs();
  const startOfCurrentWeek = now.startOf('week');
  const endOfBackgroundSyncRange = startOfCurrentWeek.add(
    BACKGROUND_SYNC_RANGE,
    'day'
  );

  const start = dayjs(startDate);
  const end = dayjs(endDate);

  // Check if the date range overlaps with the 4-week period from current week
  const isWithinRange =
    start.isBefore(endOfBackgroundSyncRange) && end.isAfter(startOfCurrentWeek);

  return isWithinRange;
};

/**
 * Update lastUpsert timestamp after successful sync
 * @param wsId - Workspace ID
 * @param supabase - Supabase client (optional, will create one if not provided)
 */
export const updateLastUpsert = async (
  wsId: string,
  supabase?: any
): Promise<void> => {
  try {
    const client = supabase || createClient();

    const { error } = await client
      .from('workspace_calendar_sync_coordination')
      .upsert(
        {
          ws_id: wsId,
          last_upsert: new Date().toISOString(),
        },
        { onConflict: 'ws_id' }
      );

    if (error) {
      console.error('Error updating lastUpsert:', error);
    } else {
      console.log('Updated lastUpsert timestamp for wsId:', wsId);
    }
  } catch (error) {
    console.error('Error updating lastUpsert:', error);
  }
};
