import 'dayjs/locale/vi';
import 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import { MeetTogetherClient } from './client-wrapper';
import Form from './form';
import type { MeetTogetherPlanWithParticipants } from './page';

interface PlansPageContentProps {
  locale: string;
  wsId?: string;
  path?: string;
  page: number;
  pageSize: number;
  plans: MeetTogetherPlanWithParticipants[];
  totalCount: number;
  user: {
    id: string;
    created_at?: string | null;
    user_metadata?: Record<string, unknown> | null;
  } | null;
}

function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : null;
}

/**
 * The Plans page: the viewer's plans beside a plan composer, with a sign-in
 * prompt in place of the list when signed out. Shared by every app that
 * mounts the page so the layout has one definition.
 */
export function PlansPageContent({
  locale,
  wsId,
  path = '/meet/plans',
  page,
  pageSize,
  plans,
  totalCount,
  user,
}: PlansPageContentProps) {
  const t = useTranslations('meet-together');
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('your_plans')}
          </h1>
          {totalCount > 0 && (
            <span className="text-muted-foreground text-sm tabular-nums">
              {t('plan_count', { count: totalCount })}
            </span>
          )}
        </div>
        {!user && (
          <p className="max-w-2xl text-muted-foreground text-sm">
            {t('new_plan_desc')}
          </p>
        )}
      </header>

      <div
        className={
          user
            ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start'
            : 'mx-auto w-full max-w-xl'
        }
      >
        <section
          aria-labelledby="plans-new-plan"
          className="space-y-3 lg:sticky lg:top-6 lg:order-2 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
        >
          <h2
            className="font-semibold text-base tracking-tight"
            id="plans-new-plan"
          >
            {t('new_plan')}
          </h2>
          <div className="rounded-xl border bg-card p-4 shadow-elevation-1 md:p-5">
            <Form
              wsId={wsId}
              planBasePath={path}
              user={
                user
                  ? {
                      id: user.id,
                      avatar_url: metadataText(
                        user.user_metadata,
                        'avatar_url'
                      ),
                      bio: metadataText(user.user_metadata, 'bio'),
                      created_at: user.created_at ?? null,
                      display_name: metadataText(
                        user.user_metadata,
                        'display_name'
                      ),
                      handle: metadataText(user.user_metadata, 'handle'),
                    }
                  : null
              }
            />
          </div>
        </section>

        {user && (
          <section aria-label={t('your_plans')} className="lg:order-1">
            <MeetTogetherClient
              currentPage={page}
              locale={locale}
              pageSize={pageSize}
              path={path}
              plans={plans}
              totalCount={totalCount}
              totalPages={totalPages}
              user={user}
            />
          </section>
        )}
      </div>
    </div>
  );
}
