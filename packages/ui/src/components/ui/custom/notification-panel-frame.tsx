import { Skeleton } from '@tuturuuu/ui/skeleton';
import type { ReactNode } from 'react';

/**
 * Geometry shared by the loaded panel header and its loading fallback, so the
 * title and tab rows keep one position and height in every state (loading,
 * empty, list) and with or without the Mark all read action.
 *
 * The title row's min height covers its vertical padding (20px) plus the
 * 32px Mark all read button (44px on coarse pointers), so the row is the same
 * height with or without the button.
 */
export const NOTIFICATION_TITLE_ROW_CLASS =
  'flex min-h-13 shrink-0 items-center gap-2 px-4 pt-3 pb-2 pointer-coarse:min-h-16';
export const NOTIFICATION_TAB_ROW_CLASS =
  'flex shrink-0 items-center gap-1 border-b px-3 pb-2';
export const NOTIFICATION_TAB_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm pointer-coarse:min-h-11';
export const NOTIFICATION_TITLE_CLASS = 'font-semibold text-[15px]';

/** The panel's loading frame: the real header geometry around skeleton rows. */
export function NotificationPanelFrameFallback({
  title,
  titleId,
  children,
}: {
  title: ReactNode;
  /** Id the popover's aria-labelledby points at, as in the loaded header. */
  titleId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy>
      <div className={NOTIFICATION_TITLE_ROW_CLASS}>
        <h2 id={titleId} className={NOTIFICATION_TITLE_CLASS}>
          {title}
        </h2>
      </div>
      <div className={NOTIFICATION_TAB_ROW_CLASS}>
        <div className="flex gap-1">
          <div className={NOTIFICATION_TAB_CLASS}>
            <Skeleton className="h-3.5 w-14" />
          </div>
          <div className={NOTIFICATION_TAB_CLASS}>
            <Skeleton className="h-3.5 w-6" />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-hidden p-2">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-start gap-2.5 px-2 py-2.5">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5 pt-1">
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
