'use client';

import { Copy } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  type RateLimitDebugDetails,
  setRateLimitDetailsHandler,
} from '@/lib/fetch-interceptor';

type DetailRow = {
  label: string;
  value: string;
};

function formatBoolean(value: boolean) {
  return value ? 'true' : 'false';
}

function formatDetailsForCopy(details: RateLimitDebugDetails) {
  return JSON.stringify(details, null, 2);
}

function RateLimitDetailRows({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
      {rows.map((row) => (
        <div className="contents" key={row.label}>
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-all rounded-md bg-muted px-2 py-1 font-mono text-xs">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RateLimitDetailsDialog() {
  const t = useTranslations('common');
  const [details, setDetails] = useState<RateLimitDebugDetails | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openDetails = (nextDetails: RateLimitDebugDetails) => {
      setDetails(nextDetails);
      setOpen(true);
    };
    const listener = (event: Event) => {
      openDetails((event as CustomEvent<RateLimitDebugDetails>).detail);
    };

    setRateLimitDetailsHandler(openDetails);
    window.addEventListener('tuturuuu:rate-limit-details', listener);

    return () => {
      setRateLimitDetailsHandler(null);
      window.removeEventListener('tuturuuu:rate-limit-details', listener);
    };
  }, []);

  const rows = useMemo<DetailRow[]>(() => {
    if (!details) return [];

    return [
      {
        label: t('rate_limited_details_fields.captured_at'),
        value: details.capturedAt,
      },
      {
        label: t('rate_limited_details_fields.page'),
        value: details.pagePath,
      },
      {
        label: t('rate_limited_details_fields.request'),
        value: details.requestPath,
      },
      {
        label: t('rate_limited_details_fields.method'),
        value: details.method,
      },
      {
        label: t('rate_limited_details_fields.status'),
        value: String(details.status),
      },
      {
        label: t('rate_limited_details_fields.retry_after'),
        value: `${details.retryAfterSeconds}s`,
      },
      {
        label: t('rate_limited_details_fields.retry_attempt'),
        value: `${details.retryAttempt}/${details.maxRetries}`,
      },
      {
        label: t('rate_limited_details_fields.will_retry'),
        value: formatBoolean(details.willRetry),
      },
      {
        label: t('rate_limited_details_fields.timezone'),
        value: details.timezone,
      },
      {
        label: t('rate_limited_details_fields.user_agent'),
        value: details.userAgent,
      },
      ...Object.entries(details.headers).map(([label, value]) => ({
        label,
        value,
      })),
    ];
  }, [details, t]);

  const copyDetails = async () => {
    if (!details) return;

    try {
      await navigator.clipboard.writeText(formatDetailsForCopy(details));
      toast.success(t('rate_limited_copied'));
    } catch {
      toast.error(t('rate_limited_copy_failed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('rate_limited_details_title')}</DialogTitle>
          <DialogDescription>
            {t('rate_limited_details_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[56vh] overflow-y-auto rounded-lg border border-border p-3">
          {details ? <RateLimitDetailRows rows={rows} /> : null}
        </div>

        <DialogFooter className="flex-wrap gap-2 max-sm:gap-2">
          <Button onClick={copyDetails} type="button">
            <Copy className="h-4 w-4" />
            {t('rate_limited_copy_details')}
          </Button>
          <Button
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
