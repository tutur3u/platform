'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Clock, FileEdit, MessageSquare, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from '@tuturuuu/icons';
import { formatDistanceToNow, format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

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

const paginationOptions = [3,5, 10, 25, 50];

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

  const formatFieldName = useCallback((field: string): string => {
    // Try to get translation first, fallback to formatted field name
    const translationKey = `activity.fields.${field}`;
    const translated = t(translationKey);
    
    // If translation exists and is different from key, use it
    if (translated !== translationKey) {
      return translated;
    }
    
    // Fallback to formatting
    return field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, [t]);

  const formatFieldValue = useCallback((value: unknown, field: string): string => {
    if (value === null || value === undefined) return 'empty';
    
    // Format timestamps with timezone
    if (field === 'start_time' || field === 'end_time') {
      const userTz = dayjs.tz.guess();
      return dayjs.utc(value as string).tz(userTz).format('MMM D, YYYY h:mm A');
    }
    
    if (typeof value === 'object') return 'changed';
    return String(value);
  }, []);

  const renderActivityContent = useCallback((activity: Activity) => {
    const { action_type, previous_status, new_status, feedback_reason, changed_fields, comment_content } = activity;

    switch (action_type) {
      case 'CREATED':
        return (
          <div>
            <p className="text-sm font-medium">{t('activity.actions.created')}</p>
            {activity.metadata?.title && (
              <p className="text-sm text-foreground/60 mt-1">
                {t('activity.titleLabel')}: {String(activity.metadata.title)}
              </p>
            )}
          </div>
        );

      case 'STATUS_CHANGED':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{t('activity.actions.statusChanged')}</p>
            </div>
            <div className="flex items-center gap-2">
              {previous_status && (
                <>
                  <Badge variant={getStatusBadgeVariant(previous_status)} className="flex items-center gap-1">
                    {getStatusIcon(previous_status)}
                    {previous_status}
                  </Badge>
                  <span className="text-foreground/40">→</span>
                </>
              )}
              {new_status && (
                <Badge variant={getStatusBadgeVariant(new_status)} className="flex items-center gap-1">
                  {getStatusIcon(new_status)}
                  {new_status}
                </Badge>
              )}
            </div>
            {feedback_reason && (
              <div className="mt-2 p-3 rounded-md bg-dynamic-surface/50 border border-dynamic-border">
                <p className="text-sm font-medium text-foreground/80 mb-1">{t('activity.feedbackLabel')}:</p>
                <p className="text-sm text-foreground/60">{feedback_reason}</p>
              </div>
            )}
          </div>
        );

      case 'CONTENT_UPDATED':
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('activity.actions.contentUpdated')}</p>
            {changed_fields && (
              <div className="space-y-1">
                {Object.entries(changed_fields).map(([field, values]) => (
                  <div key={field} className="text-sm text-foreground/60">
                    <span className="font-medium">{formatFieldName(field)}:</span>
                    {' '}
                    <span className="line-through">{formatFieldValue(values.old, field)}</span>
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
            <p className="text-sm font-medium">{t('activity.actions.commentAdded')}</p>
            {comment_content && (
              <div className="p-3 rounded-md bg-dynamic-surface/50 border border-dynamic-border">
                <p className="text-sm text-foreground/80">{comment_content}</p>
              </div>
            )}
          </div>
        );

      case 'COMMENT_UPDATED':
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('activity.actions.commentUpdated')}</p>
            {comment_content && (
              <div className="p-3 rounded-md bg-dynamic-surface/50 border border-dynamic-border">
                <p className="text-sm text-foreground/80">{comment_content}</p>
              </div>
            )}
          </div>
        );

      case 'COMMENT_DELETED':
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">{t('activity.actions.commentDeleted')}</p>
            {comment_content && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-foreground/60 line-through">{comment_content}</p>
              </div>
            )}
          </div>
        );

      default:
        return <p className="text-sm">{t('activity.unknownActivity')}</p>;
    }
  }, [t, formatFieldName, formatFieldValue]);

  // Show "no activity" message only when not loading and no data
  if (!isLoading && (!activities || activities.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-12 w-12 text-foreground/20 mb-3" />
        <p className="text-sm text-foreground/60">{t('activity.noActivity')}</p>
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
        <AccordionTrigger className="rounded-lg border hover:bg-muted/50 px-4 py-3">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">{t('activity.title')}</span>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                {totalCount}
              </span>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pt-4">
          <div className="relative space-y-4 pt-2">
            {/* Loading Overlay */}
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-dynamic-surface/60 backdrop-blur-sm rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin text-foreground/60" />
              </div>
            )}

            {activities.map((activity, index) => (
              <div key={activity.id} className="flex gap-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-dynamic-surface border-2 border-dynamic-border">
                    {getActionIcon(activity.action_type)}
                  </div>
                  {index < activities.length - 1 && (
                    <div className="flex-1 w-0.5 bg-dynamic-border min-h-10" />
                  )}
                </div>

                {/* Activity content */}
                <div className="flex-1 pb-6">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={activity.actor_avatar_url || undefined} />
                      <AvatarFallback>
                        {activity.actor_display_name?.[0]?.toUpperCase() || 
                         activity.actor_handle?.[0]?.toUpperCase() || 
                         '?'}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {activity.actor_display_name || activity.actor_handle || t('activity.unknownUser')}
                        </span>
                        <span className="text-xs text-foreground/40">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
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
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-dynamic-border">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-foreground/60">
                    {t('activity.itemsPerPage')}:
                  </label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      onItemsPerPageChange(Number(e.target.value));
                      onPageChange(1); // Reset to first page
                    }}
                    className="px-2 py-1 text-sm rounded-md border border-dynamic-border bg-dynamic-surface hover:bg-dynamic-surface/80 transition-colors"
                    disabled={isLoading}
                  >
                    {paginationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('activity.previous')}
                </Button>

                <span className="text-sm text-foreground/60">
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
                >
                  {t('activity.next')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export type { Activity, ActivityResponse, ActivityTimelineProps };
