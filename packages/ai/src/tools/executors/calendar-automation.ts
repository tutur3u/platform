import {
  applyWorkspaceCalendarSchedule,
  getGoogleCalendarAuthUrl,
  getWorkspaceCalendarSyncStatus,
  listCalendarConnections,
  listWorkspaceSchedulableTasks,
  previewWorkspaceCalendarSchedule,
  syncWorkspaceCalendar,
  updateWorkspaceCalendarEvent,
} from '@tuturuuu/internal-api/calendar';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api/client';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { Effect } from '@tuturuuu/utils/effect';
import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

type SchedulePreview = {
  success: boolean;
  preview?: { summary?: unknown; warnings?: string[]; events?: unknown[] };
  tasks?: unknown;
  habits?: unknown;
  lockedEvents?: unknown[];
};
const previews = new WeakMap<MiraToolContext, Set<string>>();

export async function executeCalendarAutomation(
  name: string,
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  if (!ctx.requestHeaders)
    return {
      success: false,
      error:
        'Calendar automation is unavailable in this session. Open Calendar settings to manage connections.',
    };
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const baseUrl = resolveInternalAppUrl({
    appName: 'calendar',
    candidates: [
      process.env.CALENDAR_APP_URL,
      process.env.NEXT_PUBLIC_CALENDAR_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://calendar.tuturuuu.com'
        : 'https://calendar.tuturuuu.localhost',
  });
  const options = withForwardedInternalApiAuth(ctx.requestHeaders, { baseUrl });
  const windowDays = typeof args.windowDays === 'number' ? args.windowDays : 7;
  const previewKey = `${wsId}:${windowDays}:${ctx.timezone ?? ''}`;
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        switch (name) {
          case 'get_calendar_connections': {
            const [connections, sync] = await Promise.all([
              listCalendarConnections(wsId, options),
              getWorkspaceCalendarSyncStatus(wsId, options),
            ]);
            return { connections, sync };
          }
          case 'connect_google_calendar':
            return getGoogleCalendarAuthUrl(wsId, options);
          case 'sync_calendar':
            return syncWorkspaceCalendar(wsId, options, {
              direction: args.direction as 'inbound' | 'outbound' | 'both',
            });
          case 'set_event_locked':
            return updateWorkspaceCalendarEvent(
              wsId,
              args.eventId as string,
              { locked: args.locked as boolean },
              options
            );
          case 'get_schedulable_tasks':
            return listWorkspaceSchedulableTasks(
              wsId,
              { q: args.query as string | undefined },
              options
            );
          case 'preview_calendar_schedule': {
            const preview =
              await previewWorkspaceCalendarSchedule<SchedulePreview>(
                wsId,
                { windowDays, clientTimezone: ctx.timezone },
                options
              );
            if (!preview.success)
              return {
                success: false,
                error: 'Scheduling preview failed. Nothing was applied.',
              };
            const keys = previews.get(ctx) ?? new Set<string>();
            keys.add(previewKey);
            previews.set(ctx, keys);
            return {
              success: true,
              summary: preview.preview?.summary,
              warnings: preview.preview?.warnings,
              events: preview.preview?.events?.slice(0, 50),
              totalEvents: preview.preview?.events?.length ?? 0,
              lockedEventCount: preview.lockedEvents?.length ?? 0,
              tasks: preview.tasks,
              habits: preview.habits,
            };
          }
          case 'apply_calendar_schedule': {
            if (!previews.get(ctx)?.has(previewKey))
              return {
                success: false,
                error: 'Preview this workspace and scheduling window first.',
              };
            previews.get(ctx)?.delete(previewKey);
            return applyWorkspaceCalendarSchedule(
              wsId,
              {
                windowDays,
                clientTimezone: ctx.timezone,
                mode: 'safe-apply',
                scope: 'impacted-only',
                forceReschedule: false,
              },
              options
            );
          }
          default:
            return { success: false, error: 'Unknown calendar operation' };
        }
      },
      catch: (error) =>
        error instanceof Error ? error.message : 'Calendar operation failed',
    }).pipe(
      Effect.catchAll((error) => Effect.succeed({ success: false, error }))
    )
  );
}
