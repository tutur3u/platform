import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { parseTimeFromTimetz } from '@tuturuuu/utils/time-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    planId: string;
  }>;
}

// Helper function to check if a timeblock is valid within the plan's time range
function isTimeblockValid(
  timeblockDate: string,
  timeblockStartTime: string,
  timeblockEndTime: string,
  planDates: string[],
  planStartTime: string,
  planEndTime: string
): boolean {
  // Check if the timeblock date is in the plan's dates
  if (!planDates.includes(timeblockDate)) {
    return false;
  }

  // Parse times for comparison
  const timeblockStartHour = parseTimeFromTimetz(timeblockStartTime);
  const timeblockEndHour = parseTimeFromTimetz(timeblockEndTime);
  const planStartHour = parseTimeFromTimetz(planStartTime);
  const planEndHour = parseTimeFromTimetz(planEndTime);

  if (
    timeblockStartHour === undefined ||
    timeblockEndHour === undefined ||
    planStartHour === undefined ||
    planEndHour === undefined
  ) {
    return false;
  }

  // Check if timeblock is within plan's time range
  return timeblockStartHour >= planStartHour && timeblockEndHour <= planEndHour;
}

// Helper function to adjust timeblock times to fit within the new plan time range
function adjustTimeblockTimes(
  timeblockStartTime: string,
  timeblockEndTime: string,
  planStartTime: string,
  planEndTime: string
): { startTime: string; endTime: string; needsAdjustment: boolean } {
  const timeblockStartHour = parseTimeFromTimetz(timeblockStartTime);
  const timeblockEndHour = parseTimeFromTimetz(timeblockEndTime);
  const planStartHour = parseTimeFromTimetz(planStartTime);
  const planEndHour = parseTimeFromTimetz(planEndTime);

  if (
    timeblockStartHour === undefined ||
    timeblockEndHour === undefined ||
    planStartHour === undefined ||
    planEndHour === undefined
  ) {
    return {
      startTime: timeblockStartTime,
      endTime: timeblockEndTime,
      needsAdjustment: false,
    };
  }

  let needsAdjustment = false;
  let newStartTime = timeblockStartTime;
  let newEndTime = timeblockEndTime;

  // If timeblock starts before plan start time, adjust to plan start time
  if (timeblockStartHour < planStartHour) {
    newStartTime = planStartTime;
    needsAdjustment = true;
  }

  // If timeblock ends after plan end time, adjust to plan end time
  if (timeblockEndHour > planEndHour) {
    newEndTime = planEndTime;
    needsAdjustment = true;
  }

  // Ensure the adjusted timeblock has a valid duration (at least 1 hour)
  const adjustedStartHour = parseTimeFromTimetz(newStartTime);
  const adjustedEndHour = parseTimeFromTimetz(newEndTime);

  if (
    adjustedStartHour !== undefined &&
    adjustedEndHour !== undefined &&
    adjustedEndHour <= adjustedStartHour
  ) {
    // If adjustment would result in invalid timeblock, return original
    return {
      startTime: timeblockStartTime,
      endTime: timeblockEndTime,
      needsAdjustment: false,
    };
  }

  return { startTime: newStartTime, endTime: newEndTime, needsAdjustment };
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }
  const sbAdmin = await createAdminClient();
  const { planId: id } = await params;

  const data = await req.json();

  // Backend validation: ensure end_time is after start_time
  if (data.start_time && data.end_time) {
    const startHour = parseTimeFromTimetz(data.start_time);
    const endHour = parseTimeFromTimetz(data.end_time);

    if (
      startHour !== undefined &&
      endHour !== undefined &&
      endHour <= startHour
    ) {
      return NextResponse.json(
        { message: 'End time must be after start time' },
        { status: 400 }
      );
    }
  }

  // Check if we need to validate timeblocks (if date, start_time, end_time, or timezone changed)
  const needsTimeblockValidation =
    data.dates !== undefined ||
    data.start_time !== undefined ||
    data.end_time !== undefined;

  if (needsTimeblockValidation) {
    // Get current plan data to compare with new data
    const { data: currentPlan } = await sbAdmin
      .from('meet_together_plans')
      .select('dates, start_time, end_time')
      .eq('id', id)
      .single();

    if (currentPlan) {
      // Use new data from request, not fallback to current data
      const newDates =
        data.dates !== undefined ? data.dates : currentPlan.dates;
      const newStartTime =
        data.start_time !== undefined
          ? data.start_time
          : currentPlan.start_time;
      const newEndTime =
        data.end_time !== undefined ? data.end_time : currentPlan.end_time;

      // Get all timeblocks for this plan
      const { data: userTimeblocks } = await sbAdmin
        .from('meet_together_user_timeblocks')
        .select('*')
        .eq('plan_id', id);

      const { data: guestTimeblocks } = await sbAdmin
        .from('meet_together_guest_timeblocks')
        .select('*')
        .eq('plan_id', id);
      const allTimeblocks = [
        ...(userTimeblocks || []),
        ...(guestTimeblocks || []),
      ];

      // Process each timeblock
      for (const timeblock of allTimeblocks) {
        const isValid = isTimeblockValid(
          timeblock.date,
          timeblock.start_time,
          timeblock.end_time,
          newDates,
          newStartTime,
          newEndTime
        );

        if (!isValid) {
          // Check if the timeblock date is still in the plan's dates
          if (!newDates.includes(timeblock.date)) {
            // Date is no longer in plan, delete the timeblock
            const isUserTimeblock = userTimeblocks?.some(
              (tb) => tb.id === timeblock.id
            );
            const tableName = isUserTimeblock
              ? 'meet_together_user_timeblocks'
              : 'meet_together_guest_timeblocks';

            console.log(
              'Deleting timeblock (date not in plan):',
              timeblock.id,
              'from table:',
              tableName
            );

            await sbAdmin.from(tableName).delete().eq('id', timeblock.id);
          } else {
            // Date is still in plan, try to adjust the timeblock times
            const adjustment = adjustTimeblockTimes(
              timeblock.start_time,
              timeblock.end_time,
              newStartTime,
              newEndTime
            );

            if (adjustment.needsAdjustment) {
              // Update the timeblock with adjusted times
              const isUserTimeblock = userTimeblocks?.some(
                (tb) => tb.id === timeblock.id
              );
              const tableName = isUserTimeblock
                ? 'meet_together_user_timeblocks'
                : 'meet_together_guest_timeblocks';

              console.log(
                'Adjusting timeblock:',
                timeblock.id,
                'from table:',
                tableName,
                'Original times:',
                timeblock.start_time,
                '-',
                timeblock.end_time,
                'New times:',
                adjustment.startTime,
                '-',
                adjustment.endTime
              );

              const updateResult = await sbAdmin
                .from(tableName)
                .update({
                  start_time: adjustment.startTime,
                  end_time: adjustment.endTime,
                })
                .eq('id', timeblock.id)
                .select('*')
                .maybeSingle();

              console.log('Update result:', updateResult);
            } else {
              // Timeblock cannot be adjusted to fit within new time range, delete it
              const isUserTimeblock = userTimeblocks?.some(
                (tb) => tb.id === timeblock.id
              );
              const tableName = isUserTimeblock
                ? 'meet_together_user_timeblocks'
                : 'meet_together_guest_timeblocks';

              console.log(
                'Deleting timeblock (cannot be adjusted):',
                timeblock.id,
                'from table:',
                tableName
              );

              await sbAdmin.from(tableName).delete().eq('id', timeblock.id);
            }
          }
        }
      }
    }
  }

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .update(data)
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { message: 'Error updating meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const { planId: id } = await params;

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { message: 'Error deleting meet together plan' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
