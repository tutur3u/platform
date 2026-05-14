'use client';

import { Clock3, Mail, ShieldCheck, UserPlus } from '@tuturuuu/icons';
import type { HiveAccessRequest } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';

type HiveAccessRequestsPanelProps = {
  locale: string;
  onApprove: (request: HiveAccessRequest) => void;
  pendingRequestId?: string;
  requests: HiveAccessRequest[];
  labels: {
    approve: string;
    description: string;
    empty: string;
    requestedAt: string;
    title: string;
  };
};

function formatRequestedAt(locale: string, value: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function HiveAccessRequestsPanel({
  labels,
  locale,
  onApprove,
  pendingRequestId,
  requests,
}: HiveAccessRequestsPanelProps) {
  return (
    <div className="mt-4 rounded-lg border border-dynamic-border/70 bg-dynamic-muted/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-dynamic-blue" />
            <h3 className="font-medium text-sm">{labels.title}</h3>
          </div>
          <p className="mt-1 text-dynamic-muted-foreground text-sm">
            {labels.description}
          </p>
        </div>
        <Badge variant="secondary">{requests.length}</Badge>
      </div>

      <div className="mt-4 grid gap-2">
        {requests.map((request) => {
          const pending = pendingRequestId === request.id;
          return (
            <div
              className="flex flex-col gap-3 rounded-md border border-dynamic-border bg-dynamic-card p-3 sm:flex-row sm:items-center sm:justify-between"
              key={request.id}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-dynamic-muted-foreground" />
                  <span className="truncate font-medium text-sm">
                    {request.email || request.userId}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-dynamic-muted-foreground text-xs">
                  <Clock3 className="h-3.5 w-3.5" />
                  {labels.requestedAt.replace(
                    '{date}',
                    formatRequestedAt(locale, request.requestedAt)
                  )}
                </div>
                {request.note && (
                  <p className="line-clamp-2 text-dynamic-muted-foreground text-sm">
                    {request.note}
                  </p>
                )}
              </div>

              <Button
                className="shrink-0"
                disabled={pending}
                onClick={() => onApprove(request)}
                size="sm"
                type="button"
              >
                <ShieldCheck className="h-4 w-4" />
                {labels.approve}
              </Button>
            </div>
          );
        })}
      </div>

      {requests.length === 0 && (
        <p className="mt-4 rounded-md border border-dynamic-border/70 bg-dynamic-background p-3 text-dynamic-muted-foreground text-sm">
          {labels.empty}
        </p>
      )}
    </div>
  );
}
