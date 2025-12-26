'use client';

import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileEdit,
  Loader2,
  MessageSquare,
  XCircle,
} from '@tuturuuu/icons';
import type { Database } from '@tuturuuu/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { formatDistanceToNow } from 'date-fns';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

type ActivityAction =
  Database['public']['Enums']['time_tracking_request_activity_action'];

dayjs.extend(utc);
dayjs.extend(timezone);

interface Activity {
  id: string;
  request_id: string;
  action_type: ActivityAction;
  actor_id: string;
  actor_display_name: string | null;
  actor_handle: string | null;
  actor_avatar_url: string | null;
  previous_status: string | null;
  new_status: string | null;
  feedback_reason: string | null;
  changed_fields: Record<string, { old: unknown; new: unknown }> | null;
  comment_id: string | null;
  comment_content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ActivityResponse {
  data: Activity[];
  total: number;
  page: number;
  limit: number;
}

interface ActivityTimelineProps {
  activities: Activity[];
  currentPage: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
  totalCount: number;
  isLoading?: boolean;
}

const getStatusBadgeVariant = (status: string | null) => {
  if (!status) return 'secondary';

  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'destructive';
    case 'NEEDS_INFO':
      return 'warning';
    case 'PENDING':
    default:
      return 'secondary';
  }
};

const getStatusIcon = (status: string | null) => {
  if (!status) return null;

  switch (status) {
    case 'APPROVED':
      return <CheckCircle className="h-4 w-4" />;
    case 'REJECTED':
      return <XCircle className="h-4 w-4" />;
    case 'NEEDS_INFO':
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const getActionIcon = (action: ActivityAction) => {
  switch (action) {
    case 'CREATED':
      return <Clock className="h-4 w-4" />;
    case 'CONTENT_UPDATED':
      return <FileEdit className="h-4 w-4" />;
    case 'STATUS_CHANGED':
      return <Clock className="h-4 w-4" />;
    case 'COMMENT_ADDED':
    case 'COMMENT_UPDATED':
    case 'COMMENT_DELETED':
      return <MessageSquare className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const paginationOptions = [3, 5, 10, 25, 50];

export function ActivityTimeline({
  activities,
  currentPage,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
  totalCount,
  isLoading = false,
}: ActivityTimelineProps) {
  const t = useTranslations('time-tracker.requests.detail');
  const [accordionValue, setAccordionValue] = useState<string>(''); // Closed by default

  const formatFieldName = useCallback(
    (field: string): string => {
      // Try to get translation first, fallback to formatted field name
      const translationKey = `activity.fields.${field}` as any;
      const translated = t(translationKey);

      // If translation exists and is different from key, use it
      if (translated !== translationKey) {
        return translated;
      }

      // Fallback to formatting
      return field
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    },
    [t]
  );

  const formatFieldValue = useCallback(
    (value: unknown, field: string): string => {
      if (value === null || value === undefined) return 'empty';

      // Format timestamps with timezone
      if (field === 'start_time' || field === 'end_time') {
        const userTz = dayjs.tz.guess();
        return dayjs
          .utc(value as string)
          .tz(userTz)
          .format('MMM D, YYYY h:mm A');
      }

      if (typeof value === 'object') return 'changed';
      return String(value);
    },
    []
  );

  const renderActivityContent = useCallback(
    (activity: Activity) => {
      const {
        action_type,
        previous_status,
        new_status,
        feedback_reason,
        changed_fields,
        comment_content,
      } = activity;

      switch (action_type) {
        case 'CREATED':
          return (
            <div>
              <p className="font-medium text-sm">
                {t('activity.actions.created')}
              </p>
              {activity.metadata?.title != null && (
                <p className="mt-1 text-foreground/60 text-sm">
                  {t('activity.titleLabel')}: {String(activity.metadata.title)}
                </p>
              )}
            </div>
          );

        case 'STATUS_CHANGED':
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">
                  {t('activity.actions.statusChanged')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {previous_status && (
                  <>
                    <Badge
                      variant={getStatusBadgeVariant(previous_status)}
                      className="flex items-center gap-1"
                    >
                      {getStatusIcon(previous_status)}
                      {previous_status}
                    </Badge>
                    <span className="text-foreground/40">→</span>
                  </>
                )}
                {new_status && (
                  <Badge
                    variant={getStatusBadgeVariant(new_status)}
                    className="flex items-center gap-1"
                  >
                    {getStatusIcon(new_status)}
                    {new_status}
                  </Badge>
                )}
              </div>
              {feedback_reason && (
                <div className="mt-2 rounded-md border border-dynamic-border bg-dynamic-surface/50 p-3">
                  <p className="mb-1 font-medium text-foreground/80 text-sm">
                    {t('activity.feedbackLabel')}:
                  </p>
                  <p className="text-foreground/60 text-sm">
                    {feedback_reason}
                  </p>
                </div>
              )}
            </div>
          );

        case 'CONTENT_UPDATED':
          return (
            <div className="space-y-2">
              <p className="font-medium text-sm">
                {t('activity.actions.contentUpdated')}
              </p>
              {changed_fields && (
                <div className="space-y-1">
                  {Object.entries(changed_fields).map(([field, values]) => (
                    <div key={field} className="text-foreground/60 text-sm">
                      <span className="font-medium">
                        {formatFieldName(field)}:
                      </span>{' '}
                      <span className="line-through">
                        {formatFieldValue(values.old, field)}
                      </span>
                      {' → '}
                      <span>{formatFieldValue(values.new, field)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );

        case 'COMMENT_ADDED':
          return (
            <div className="space-y-2">
              <p className="font-medium text-sm">
                {t('activity.actions.commentAdded')}
              </p>
              {comment_content && (
                <div className="rounded-md border border-dynamic-border bg-dynamic-surface/50 p-3">
                  <p className="text-foreground/80 text-sm">
                    {comment_content}
                  </p>
                </div>
              )}
            </div>
          );

        case 'COMMENT_UPDATED':
          return (
            <div className="space-y-2">
              <p className="font-medium text-sm">
                {t('activity.actions.commentUpdated')}
              </p>
              {comment_content && (
                <div className="rounded-md border border-dynamic-border bg-dynamic-surface/50 p-3">
                  <p className="text-foreground/80 text-sm">
                    {comment_content}
                  </p>
                </div>
              )}
            </div>
          );

        case 'COMMENT_DELETED':
          return (
            <div className="space-y-2">
              <p className="font-medium text-destructive text-sm">
                {t('activity.actions.commentDeleted')}
              </p>
              {comment_content && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                  <p className="text-foreground/60 text-sm line-through">
                    {comment_content}
                  </p>
                </div>
              )}
            </div>
          );

        default:
          return <p className="text-sm">{t('activity.unknownActivity')}</p>;
      }
    },
    [t, formatFieldName, formatFieldValue]
  );

  // Show "no activity" message only when not loading and no data
  if (!isLoading && (!activities || activities.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="mb-3 h-12 w-12 text-foreground/20" />
        <p className="text-foreground/60 text-sm">{t('activity.noActivity')}</p>
      </div>
    );
  }

  // Calculate pagination (server-side)
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const handlePrevPage = () => {
    onPageChange(Math.max(1, currentPage - 1));
  };

  const handleNextPage = () => {
    onPageChange(Math.min(totalPages, currentPage + 1));
  };

  return (
    <Accordion
      type="single"
      collapsible
      className="border-0"
      value={accordionValue}
      onValueChange={setAccordionValue}
    >
      <AccordionItem value="activity-timeline" className="border-b-0">
        <AccordionTrigger className="rounded-lg border px-4 py-3 hover:bg-muted/50">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">{t('activity.title')}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                {totalCount}
              </span>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pt-4">
          {/* Show "no activity" message when not loading and no data */}
          {!isLoading && (!activities || activities.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="mb-3 h-12 w-12 text-foreground/20" />
              <p className="text-foreground/60 text-sm">
                {t('activity.noActivity')}
              </p>
            </div>
          ) : (
            <div className="relative space-y-4 pt-2">
              {/* Loading Overlay */}
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-dynamic-surface/60 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground/60" />
                </div>
              )}

              {activities.map((activity, index) => (
                <div key={activity.id} className="flex gap-4">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dynamic-border bg-dynamic-surface">
                      {getActionIcon(activity.action_type)}
                    </div>
                    {index < activities.length - 1 && (
                      <div className="min-h-10 w-0.5 flex-1 bg-dynamic-border" />
                    )}
                  </div>

                  {/* Activity content */}
                  <div className="flex-1 pb-6">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage
                          src={activity.actor_avatar_url || undefined}
                        />
                        <AvatarFallback>
                          {activity.actor_display_name?.[0]?.toUpperCase() ||
                            activity.actor_handle?.[0]?.toUpperCase() ||
                            '?'}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-baseline gap-2">
                          <span className="font-medium text-sm">
                            {activity.actor_display_name ||
                              activity.actor_handle ||
                              t('activity.unknownUser')}
                          </span>
                          <span className="text-foreground/40 text-xs">
                            {formatDistanceToNow(
                              new Date(activity.created_at),
                              { addSuffix: true }
                            )}
                          </span>
                        </div>

                        {renderActivityContent(activity)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-3 border-dynamic-border border-t pt-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <label className="whitespace-nowrap text-foreground/60 text-sm">
                      {t('activity.itemsPerPage')}:
                    </label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        onItemsPerPageChange(Number(e.target.value));
                        onPageChange(1); // Reset to first page
                      }}
                      className="rounded-md border border-dynamic-border bg-dynamic-surface px-2 py-1 text-sm transition-colors hover:bg-dynamic-surface/80"
                      disabled={isLoading}
                    >
                      {paginationOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={currentPage === 1 || isLoading}
                      className="shrink-0"
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      <span className="hidden sm:inline">
                        {t('activity.previous')}
                      </span>
                    </Button>

                    <span className="whitespace-nowrap text-foreground/60 text-sm">
                      {t('activity.pageInfo', {
                        current: currentPage,
                        total: totalPages,
                      })}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages || isLoading}
                      className="shrink-0"
                    >
                      <span className="hidden sm:inline">
                        {t('activity.next')}
                      </span>
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export type { Activity, ActivityResponse, ActivityTimelineProps };
