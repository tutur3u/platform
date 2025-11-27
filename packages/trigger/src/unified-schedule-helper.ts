/**
 * Unified Scheduler Helper
 *
 * Calls the unified schedule API endpoint to schedule both habits and tasks.
 * This helper is used by the background scheduling job.
 */

type UnifiedScheduleResult = {
  success: boolean;
  data?: {
    summary: {
      habitsScheduled: number;
      tasksScheduled: number;
      eventsCreated: number;
      bumpedHabits: number;
      rescheduledHabits: number;
      windowDays: number;
    };
    warnings: string[];
  };
  error?: string;
};

export const unifiedScheduleHelper = async (
  ws_id: string,
  options: {
    windowDays?: number;
    forceReschedule?: boolean;
  } = {}
): Promise<UnifiedScheduleResult> => {
  console.log(`[${ws_id}] Starting unified schedule helper`);

  try {
    // Get the base URL from environment variables
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://tuturuuu.com'
        : 'http://localhost:7803';

    const fullUrl = `${baseUrl}/api/v1/workspaces/${ws_id}/calendar/schedule`;

    console.log(`[${ws_id}] Calling unified schedule API:`, fullUrl);

    const secretKey = process.env.INTERNAL_TRIGGER_SECRET_KEY;

    if (!secretKey) {
      throw new Error('INTERNAL_TRIGGER_SECRET_KEY is not set');
    }

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-trigger-secret-key': secretKey,
      },
      body: JSON.stringify({
        windowDays: options.windowDays ?? 30,
        forceReschedule: options.forceReschedule ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    console.log(`[${ws_id}] Unified schedule completed:`, {
      habitsScheduled: data.summary?.habitsScheduled,
      tasksScheduled: data.summary?.tasksScheduled,
      eventsCreated: data.summary?.eventsCreated,
      bumpedHabits: data.summary?.bumpedHabits,
      warnings: data.warnings?.length ?? 0,
    });

    return {
      success: true,
      data: {
        summary: data.summary,
        warnings: data.warnings,
      },
    };
  } catch (error) {
    console.error(`[${ws_id}] Error in unified schedule helper:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
