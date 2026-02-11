'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { parseTimeFromTimetz } from '@tuturuuu/utils/time-helper';
import { revalidatePath } from 'next/cache';

// Types for batched operations
interface BatchDeleteOperation {
  type: 'delete';
  tableName: string;
  id: string;
}

interface BatchUpdateOperation {
  type: 'update';
  tableName: string;
  id: string;
  data: { start_time: string; end_time: string };
}

type BatchOperation = BatchDeleteOperation | BatchUpdateOperation;

// Helper function to execute batched operations
async function executeBatchOperations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sbAdmin: any,
  operations: BatchOperation[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const deleteOperations: { [tableName: string]: string[] } = {};
    const updateOperations: { [tableName: string]: BatchUpdateOperation[] } =
      {};

    for (const operation of operations) {
      if (operation.type === 'delete') {
        if (!deleteOperations[operation.tableName]) {
          deleteOperations[operation.tableName] = [];
        }
        deleteOperations[operation.tableName]!.push(operation.id);
      } else {
        if (!updateOperations[operation.tableName]) {
          updateOperations[operation.tableName] = [];
        }
        updateOperations[operation.tableName]!.push(operation);
      }
    }

    for (const [tableName, ids] of Object.entries(deleteOperations)) {
      if (ids && ids.length > 0) {
        const result = await sbAdmin.from(tableName).delete().in('id', ids);
        if (result.error) {
          return {
            success: false,
            error: `Error deleting from ${tableName}: ${result.error.message || 'Unknown error'}`,
          };
        }
      }
    }

    for (const [tableName, updates] of Object.entries(updateOperations)) {
      if (updates && updates.length > 0) {
        const updatePromises = updates.map(async (update) => {
          const result = await sbAdmin
            .from(tableName)
            .update(update.data)
            .eq('id', update.id);
          if (result.error) {
            throw new Error(
              `Error updating ${tableName}: ${result.error.message || 'Unknown error'}`
            );
          }
          return result;
        });

        try {
          await Promise.all(updatePromises);
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error in batch updates',
          };
        }
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error in batch operations',
    };
  }
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
  if (!planDates.includes(timeblockDate)) {
    return false;
  }

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

  if (timeblockStartHour < planStartHour) {
    newStartTime = planStartTime;
    needsAdjustment = true;
  }

  if (timeblockEndHour > planEndHour) {
    newEndTime = planEndTime;
    needsAdjustment = true;
  }

  const adjustedStartHour = parseTimeFromTimetz(newStartTime);
  const adjustedEndHour = parseTimeFromTimetz(newEndTime);

  if (
    adjustedStartHour !== undefined &&
    adjustedEndHour !== undefined &&
    adjustedEndHour <= adjustedStartHour
  ) {
    return {
      startTime: timeblockStartTime,
      endTime: timeblockEndTime,
      needsAdjustment: false,
    };
  }

  return { startTime: newStartTime, endTime: newEndTime, needsAdjustment };
}

export interface CreatePlanInput {
  name?: string;
  dates?: string[];
  start_time?: string;
  end_time?: string;
  where_to_meet?: boolean;
  description?: string;
}

export async function createPlan(data: CreatePlanInput) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Backend validation: ensure end_time is after start_time
  if (data.start_time && data.end_time) {
    const startHour = parseTimeFromTimetz(data.start_time);
    const endHour = parseTimeFromTimetz(data.end_time);

    if (
      startHour !== undefined &&
      endHour !== undefined &&
      endHour <= startHour
    ) {
      return { error: 'End time must be after start time' };
    }
  }

  const { data: plan, error } = await sbAdmin
    .from('meet_together_plans')
    .insert({
      name: data.name,
      dates: data.dates || [],
      start_time: data.start_time || '00:00:00',
      end_time: data.end_time || '23:59:59',
      where_to_meet: data.where_to_meet ?? false,
      description: data.description,
      creator_id: user?.id,
      is_confirmed: false,
    })
    .select('id, where_to_meet')
    .single();

  if (error) {
    return { error: 'Error creating meet together plan' };
  }

  if (plan.where_to_meet && typeof plan.id === 'string' && user?.id) {
    const { error: pollError } = await sbAdmin.from('polls').insert({
      plan_id: plan.id,
      creator_id: user?.id,
      name: 'Where to Meet?',
    });

    if (pollError) {
      return {
        data: { id: plan.id },
        warning: 'Plan created, but failed to create "where" poll',
      };
    }
  }

  revalidatePath('/meet-together');
  return { data: { id: plan.id } };
}

export async function getPlans() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('meet_together_plans')
    .select('*');

  if (error) {
    return { error: 'Error fetching meet together plans' };
  }

  return { data };
}

export interface UpdatePlanInput {
  name?: string;
  dates?: string[];
  start_time?: string;
  end_time?: string;
  where_to_meet?: boolean;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agenda_content?: any;
}

export async function updatePlan(planId: string, data: UpdatePlanInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const sbAdmin = await createAdminClient();

  // Check if user is the creator of the plan
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('creator_id, is_confirmed')
    .eq('id', planId)
    .single();

  if (!plan) {
    return { error: 'Plan not found' };
  }

  if (plan.creator_id !== user.id) {
    return { error: 'You are not the creator of this plan' };
  }

  if (plan.is_confirmed) {
    return { error: 'Plan is confirmed. No modifications allowed.' };
  }

  // Backend validation: ensure end_time is after start_time
  if (data.start_time && data.end_time) {
    const startHour = parseTimeFromTimetz(data.start_time);
    const endHour = parseTimeFromTimetz(data.end_time);

    if (
      startHour !== undefined &&
      endHour !== undefined &&
      endHour <= startHour
    ) {
      return { error: 'End time must be after start time' };
    }
  }

  // Check if we need to validate timeblocks
  const needsTimeblockValidation =
    data.dates !== undefined ||
    data.start_time !== undefined ||
    data.end_time !== undefined;

  if (needsTimeblockValidation) {
    const { data: currentPlan } = await sbAdmin
      .from('meet_together_plans')
      .select('dates, start_time, end_time')
      .eq('id', planId)
      .single();

    if (currentPlan) {
      const newDates =
        data.dates !== undefined ? data.dates : currentPlan.dates;
      const newStartTime =
        data.start_time !== undefined
          ? data.start_time
          : currentPlan.start_time;
      const newEndTime =
        data.end_time !== undefined ? data.end_time : currentPlan.end_time;

      const { data: userTimeblocks } = await sbAdmin
        .from('meet_together_user_timeblocks')
        .select('*')
        .eq('plan_id', planId);

      const { data: guestTimeblocks } = await sbAdmin
        .from('meet_together_guest_timeblocks')
        .select('*')
        .eq('plan_id', planId);

      const allTimeblocks = [
        ...(userTimeblocks || []),
        ...(guestTimeblocks || []),
      ];

      const batchOperations: BatchOperation[] = [];

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
          if (!newDates.includes(timeblock.date)) {
            const isUserTimeblock = userTimeblocks?.some(
              (tb) => tb.id === timeblock.id
            );
            const tableName = isUserTimeblock
              ? 'meet_together_user_timeblocks'
              : 'meet_together_guest_timeblocks';

            batchOperations.push({
              type: 'delete',
              tableName,
              id: timeblock.id,
            });
          } else {
            const adjustment = adjustTimeblockTimes(
              timeblock.start_time,
              timeblock.end_time,
              newStartTime,
              newEndTime
            );

            if (adjustment.needsAdjustment) {
              const isUserTimeblock = userTimeblocks?.some(
                (tb) => tb.id === timeblock.id
              );
              const tableName = isUserTimeblock
                ? 'meet_together_user_timeblocks'
                : 'meet_together_guest_timeblocks';

              batchOperations.push({
                type: 'update',
                tableName,
                id: timeblock.id,
                data: {
                  start_time: adjustment.startTime,
                  end_time: adjustment.endTime,
                },
              });
            } else {
              const isUserTimeblock = userTimeblocks?.some(
                (tb) => tb.id === timeblock.id
              );
              const tableName = isUserTimeblock
                ? 'meet_together_user_timeblocks'
                : 'meet_together_guest_timeblocks';

              batchOperations.push({
                type: 'delete',
                tableName,
                id: timeblock.id,
              });
            }
          }
        }
      }

      if (batchOperations.length > 0) {
        const batchResult = await executeBatchOperations(
          sbAdmin,
          batchOperations
        );
        if (!batchResult.success) {
          return {
            error: batchResult.error || 'Error processing timeblock updates',
          };
        }
      }
    }
  }

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .update(data)
    .eq('id', planId);

  if (error) {
    return { error: 'Error updating meet together plan' };
  }

  revalidatePath('/meet-together');
  revalidatePath(`/meet-together/plans/${planId}`);
  return { data: { success: true } };
}

export async function deletePlan(planId: string) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('creator_id, is_confirmed')
    .eq('id', planId)
    .single();

  if (!plan) {
    return { error: 'Plan not found' };
  }

  if (plan.creator_id !== user.id) {
    return { error: 'You are not the creator of this plan' };
  }

  if (plan.is_confirmed) {
    return { error: 'Plan is confirmed. No modifications allowed.' };
  }

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .delete()
    .eq('id', planId);

  if (error) {
    return { error: 'Error deleting meet together plan' };
  }

  revalidatePath('/meet-together');
  return { data: { success: true } };
}

export async function togglePlanLock(planId: string, isConfirm: boolean) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { error: 'Unauthorized' };
  }

  // Check creator
  const { data: plan } = await sbAdmin
    .from('meet_together_plans')
    .select('creator_id')
    .eq('id', planId)
    .single();

  if (!plan || plan.creator_id !== user.id) {
    return { error: 'Forbidden' };
  }

  const { error } = await sbAdmin
    .from('meet_together_plans')
    .update({
      ...(typeof isConfirm === 'boolean' && { is_confirmed: isConfirm }),
    })
    .eq('id', planId);

  if (error) {
    return { error: 'Update failed' };
  }

  revalidatePath(`/meet-together/plans/${planId}`);
  return { data: { success: true } };
}
