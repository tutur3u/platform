export type NotificationSide = 'top' | 'right' | 'bottom' | 'left';
export type NotificationAlign = 'start' | 'center' | 'end';

export interface NotificationPlacement {
  side: NotificationSide;
  align: NotificationAlign;
}

/** Below this width the shared sidebar is a full-width sheet, not a rail. */
const RAIL_MIN_WIDTH = 768;

/**
 * Where the panel opens relative to the bell. A bell in the shared sidebar
 * (`<aside>`) opens beside the rail so the panel never covers navigation; on
 * narrow screens the sidebar is a sheet, so the panel opens above its footer.
 * Any other bell (navbars, headers) opens below, end-aligned.
 */
export function resolveNotificationPlacement(
  trigger: Element | null,
  viewportWidth: number
): NotificationPlacement {
  if (trigger?.closest('aside')) {
    return viewportWidth >= RAIL_MIN_WIDTH
      ? { side: 'right', align: 'end' }
      : { side: 'top', align: 'end' };
  }
  return { side: 'bottom', align: 'end' };
}
