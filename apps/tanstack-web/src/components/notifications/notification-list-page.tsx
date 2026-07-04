'use client';

import { Bell } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type {
  NotificationsRouteData,
  NotificationsSearch,
} from '@/lib/notifications/notification-list-route-data';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from '@/lib/platform/next-navigation-shim';
import { NotificationListCard } from './notification-list-card';
import { NotificationListFilters } from './notification-list-filters';
import { countNotifications } from './notification-list-utils';

type NotificationListPageProps = {
  data: NotificationsRouteData;
  locale: string;
};

function buildNotificationsHref(
  pathname: string,
  searchParams: URLSearchParams,
  updates: Partial<NotificationsSearch>
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  for (const [key, value] of Object.entries(updates)) {
    if (value === '' || value === undefined || value === null) {
      nextParams.delete(key);
    } else {
      nextParams.set(key, String(value));
    }
  }

  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function NotificationListPage({
  data,
  locale,
}: NotificationListPageProps) {
  const t = useTranslations('notifications');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { count, notifications } = data.notifications;
  const totalPages = Math.max(1, Math.ceil(count / data.pageSize));
  const hasPrevious = data.page > 1;
  const hasNext = data.page < totalPages;
  const counts = useMemo(
    () => ({
      all: countNotifications(notifications, 'all'),
      mentions: countNotifications(notifications, 'mentions'),
      tasks: countNotifications(notifications, 'tasks'),
      unread: countNotifications(notifications, 'unread'),
    }),
    [notifications]
  );

  const updateSearch = (updates: Partial<NotificationsSearch>) => {
    router.push(buildNotificationsHref(pathname, searchParams, updates));
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-8">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-dynamic-blue/10">
          <Bell className="h-5 w-5 text-dynamic-blue" />
        </div>
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            {t('notifications')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {count.toLocaleString(locale)} {t('total_notifications')}
          </p>
        </div>
      </div>

      <NotificationListFilters
        counts={counts}
        onUpdate={updateSearch}
        search={data}
      />

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-lg">{t('empty_all_title')}</h2>
            <p className="mt-1 max-w-md text-muted-foreground text-sm">
              {t('empty_all_description')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationListCard
              key={notification.id}
              locale={locale}
              notification={notification}
              unreadLabel={t('tab_unread')}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t('page')} {data.page.toLocaleString(locale)} /{' '}
          {totalPages.toLocaleString(locale)}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={!hasPrevious}
            onClick={() => updateSearch({ page: data.page - 1 })}
            type="button"
            variant="outline"
          >
            {t('previous')}
          </Button>
          <Button
            disabled={!hasNext}
            onClick={() => updateSearch({ page: data.page + 1 })}
            type="button"
            variant="outline"
          >
            {t('next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
