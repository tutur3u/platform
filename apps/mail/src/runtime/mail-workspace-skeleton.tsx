import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

const ROW_COUNT = 7;
const FOLDER_COUNT = 7;
const pulse = 'motion-reduce:animate-none';

function SidebarSkeleton() {
  return (
    <div
      className="hidden w-64 shrink-0 flex-col gap-4 border-dynamic border-r p-3 md:flex"
      data-slot="mail-skeleton-sidebar"
    >
      <div className="flex items-center gap-2">
        <Skeleton className={`size-8 rounded-lg ${pulse}`} />
        <Skeleton className={`h-4 w-28 ${pulse}`} />
      </div>
      <Skeleton className={`h-9 w-full rounded-lg ${pulse}`} />
      <div className="flex flex-col gap-1">
        {Array.from({ length: FOLDER_COUNT }, (_, row) => (
          <div className="flex h-9 items-center gap-3 px-2" key={row}>
            <Skeleton className={`size-4 ${pulse}`} />
            <Skeleton className={`h-3 w-24 ${pulse}`} />
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2">
        <Skeleton className={`size-8 rounded-full ${pulse}`} />
        <Skeleton className={`h-3 w-24 ${pulse}`} />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <section
      className="flex h-full min-w-0 flex-1 flex-col bg-background/95 lg:flex-none lg:basis-[38%]"
      data-slot="mail-skeleton-list"
    >
      <div className="flex min-h-14 items-center gap-2 border-dynamic border-b py-2 pr-2 pl-4">
        <Skeleton className={`h-5 w-24 ${pulse}`} />
        <Skeleton className={`ml-auto size-8 rounded-lg ${pulse}`} />
      </div>
      <div className="space-y-2 border-dynamic border-b p-3">
        <Skeleton className={`h-9 w-full rounded-lg ${pulse}`} />
        <div className="flex items-center justify-between gap-1">
          <Skeleton className={`h-6 w-40 ${pulse}`} />
          <Skeleton className={`size-7 ${pulse}`} />
        </div>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-border/50 overflow-hidden">
        {Array.from({ length: ROW_COUNT }, (_, row) => (
          <div className="space-y-3 px-5 py-5" key={row}>
            <div className="flex justify-between gap-8">
              <Skeleton className={`h-3 w-28 ${pulse}`} />
              <Skeleton className={`h-3 w-10 ${pulse}`} />
            </div>
            <Skeleton className={`h-3 w-4/5 ${pulse}`} />
            <Skeleton className={`h-3 w-3/5 ${pulse}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ReaderSkeleton() {
  return (
    <section
      className="hidden h-full min-w-0 flex-1 flex-col gap-6 border-dynamic border-l bg-muted/20 p-6 lg:flex"
      data-slot="mail-skeleton-reader"
    >
      <Skeleton className={`h-6 w-2/3 ${pulse}`} />
      <div className="flex items-center gap-3">
        <Skeleton className={`size-10 rounded-full ${pulse}`} />
        <div className="space-y-2">
          <Skeleton className={`h-3 w-36 ${pulse}`} />
          <Skeleton className={`h-3 w-52 ${pulse}`} />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className={`h-3 w-full ${pulse}`} />
        <Skeleton className={`h-3 w-11/12 ${pulse}`} />
        <Skeleton className={`h-3 w-4/5 ${pulse}`} />
        <Skeleton className={`h-3 w-3/5 ${pulse}`} />
      </div>
    </section>
  );
}

const STATUS_PROPS = { 'aria-busy': true, role: 'status' } as const;

/**
 * The thread list and reader that `MailWorkspace` renders inside the shell,
 * with the same wrapper box and default pane split so the real client replaces
 * it without moving the shell.
 */
export function MailContentSkeleton() {
  const t = useTranslations('mail');
  return (
    <div
      {...STATUS_PROPS}
      aria-label={t('loading')}
      className="-m-2 h-[calc(100dvh-4.25rem)] min-h-[calc(100dvh-4.25rem)] min-w-0 md:-m-4 md:h-dvh md:min-h-dvh"
    >
      <div aria-hidden className="flex h-full w-full overflow-hidden">
        <ListSkeleton />
        <ReaderSkeleton />
      </div>
    </div>
  );
}

/**
 * Placeholder for the whole Mail workspace (sidebar, list, reader) that holds
 * the final layout while the page model resolves. Layout dimensions mirror the
 * real shell so the swap does not shift content; the bars carry no data.
 */
export function MailWorkspaceSkeleton() {
  const t = useTranslations('mail');
  return (
    <div
      {...STATUS_PROPS}
      aria-label={t('loading')}
      className="flex h-dvh w-full overflow-hidden bg-root-background"
    >
      <div aria-hidden className="flex h-full w-full">
        <SidebarSkeleton />
        <ListSkeleton />
        <ReaderSkeleton />
      </div>
    </div>
  );
}
