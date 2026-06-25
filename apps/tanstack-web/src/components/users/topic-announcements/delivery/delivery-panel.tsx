'use client';

import { CircleHelp, Send } from '@tuturuuu/icons';
import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DeliveryRecipients } from './delivery-recipients';

interface DeliveryPanelProps {
  announcements: TopicAnnouncementRecord[];
  isLoading?: boolean;
  locale: string;
  schedulingTimezone: string | null;
  wsId: string;
}

export function DeliveryPanel({
  announcements,
  isLoading = false,
  locale,
  schedulingTimezone,
  wsId,
}: DeliveryPanelProps) {
  const t = useTranslations('ws-topic-announcements');
  const delivered = announcements.filter(
    (announcement) => announcement.status === 'sent'
  );
  const timezone = schedulingTimezone ?? 'UTC';

  if (!isLoading && delivered.length === 0) {
    return (
      <DeliveryEmptyState
        action={
          <Button asChild size="sm">
            <a
              href={`/${locale}/${wsId}/users/topic-announcements/announcements`}
            >
              {t('delivery_compose_cta')}
            </a>
          </Button>
        }
        description={t('delivery_empty_desc')}
        title={t('delivery_empty_title')}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('announcement_title')}</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                {t('recipients')}
                <DeliveryHelpTip label={t('delivery_relationship_help')} />
              </span>
            </TableHead>
            <TableHead>{t('sent_at')}</TableHead>
            <TableHead>{t('status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <TableRow key={`delivery-loading-${index}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-64" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {delivered.map((announcement) => (
            <TableRow key={announcement.id}>
              <TableCell className="min-w-48 align-top font-medium">
                {announcement.title}
              </TableCell>
              <TableCell className="min-w-64 align-top">
                <DeliveryRecipients announcement={announcement} />
              </TableCell>
              <TableCell className="whitespace-nowrap align-top">
                {formatTopicAnnouncementInstant(
                  announcement.sent_at,
                  timezone
                ) ?? t('not_sent')}
              </TableCell>
              <TableCell className="align-top">
                <Badge className="gap-1" variant="success">
                  <Send className="h-3 w-3" />
                  {t('status_sent')}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DeliveryEmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border border-dashed bg-background px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue [&>svg]:h-6 [&>svg]:w-6">
        <Send />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

function DeliveryHelpTip({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={label}
            className="inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            type="button"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-pretty">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatTopicAnnouncementInstant(
  value: string | null | undefined,
  timezone: string
) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}
