'use client';

import type { MobileDeploymentState } from '@tuturuuu/internal-api/infrastructure/mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

export function MobileDeploymentAuditPanel({
  auditEvents,
}: {
  auditEvents: MobileDeploymentState['auditEvents'];
}) {
  const t = useTranslations('mobile-deployment-settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('auditTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {auditEvents.slice(0, 12).map((event) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              key={event.id}
            >
              <span>{event.eventType}</span>
              <span className="text-muted-foreground text-xs">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
