'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { useTranslations } from 'next-intl';
import type { UserGroupActivityEvent } from '@/lib/user-group-activity/normalize';
import { formatActivityDateTime } from './activity-log-utils';

function FieldSnapshot({
  title,
  values,
}: {
  title: string;
  values: Record<string, string | null>;
}) {
  const entries = Object.entries(values);

  return (
    <div className="rounded-md border border-border/70 p-3">
      <div className="mb-2 font-medium text-sm">{title}</div>
      {entries.length === 0 ? (
        <div className="text-muted-foreground text-sm">-</div>
      ) : (
        <dl className="space-y-2">
          {entries.map(([field, value]) => (
            <div key={field} className="grid gap-1 text-sm">
              <dt className="text-muted-foreground">{field}</dt>
              <dd className="break-words font-mono text-xs">
                {value ?? 'null'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function UserGroupActivityDetailSheet({
  selectedEvent,
  onOpenChange,
}: {
  selectedEvent: UserGroupActivityEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();

  return (
    <Sheet open={Boolean(selectedEvent)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        {selectedEvent && (
          <>
            <SheetHeader>
              <SheetTitle>{selectedEvent.summary}</SheetTitle>
              <SheetDescription>
                {formatActivityDateTime(selectedEvent.occurredAt)}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 rounded-md border border-border/70 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {t('ws-user-group-activity.group')}:
                  </span>{' '}
                  {selectedEvent.group.name ?? '-'}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t('ws-user-group-activity.affected_user')}:
                  </span>{' '}
                  {selectedEvent.affectedUser?.name ||
                    selectedEvent.affectedUser?.email ||
                    '-'}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t('ws-user-group-activity.actor')}:
                  </span>{' '}
                  {selectedEvent.actor.name ||
                    selectedEvent.actor.email ||
                    selectedEvent.actor.authUid ||
                    '-'}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldSnapshot
                  title={t('ws-user-group-activity.before')}
                  values={selectedEvent.before}
                />
                <FieldSnapshot
                  title={t('ws-user-group-activity.after')}
                  values={selectedEvent.after}
                />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
