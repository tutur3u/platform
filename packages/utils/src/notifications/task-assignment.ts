import { tasks } from '@trigger.dev/sdk/v3';

/**
 * Triggers an email notification when a user is assigned to a task
 * This function is non-blocking and will not throw errors
 */
export async function notifyTaskAssignment({
  taskId,
  assigneeUserId,
  assignedByUserId,
  wsId,
}: {
  taskId: string;
  assigneeUserId: string;
  assignedByUserId: string;
  wsId: string;
}): Promise<void> {
  // Skip notifications in test environment
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    // Import dynamically to avoid issues if Trigger.dev is not configured
    const { sendTaskAssignmentNotification } = await import(
      '@tuturuuu/trigger/task-assignment-notification'
    );

    // Trigger the notification asynchronously
    await sendTaskAssignmentNotification.trigger(
      {
        task_id: taskId,
        assignee_user_id: assigneeUserId,
        assigned_by_user_id: assignedByUserId,
        ws_id: wsId,
      },
      {
        // Use a unique idempotency key to prevent duplicate notifications
        idempotencyKey: `task-assignment-${taskId}-${assigneeUserId}-${Date.now()}`,
      }
    );

    console.log('[Task Assignment] Notification triggered:', {
      taskId,
      assigneeUserId,
    });
  } catch (error) {
    // Log error but don't throw - notifications should not break the main flow
    console.error('[Task Assignment] Failed to trigger notification:', error);
  }
}
