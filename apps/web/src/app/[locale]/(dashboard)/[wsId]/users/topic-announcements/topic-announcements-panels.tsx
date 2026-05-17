'use client';

import type {
  TopicAnnouncementContact,
  TopicAnnouncementPayload,
  TopicAnnouncementRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { AnnouncementForm } from './announcement-form';
import { AnnouncementTable } from './announcement-table';

const STATUS_LABEL_KEYS = {
  all: 'status_all',
  cancelled: 'status_cancelled',
  draft: 'status_draft',
  failed: 'status_failed',
  sent: 'status_sent',
  skipped: 'status_skipped',
} as const;
const STATUSES = Object.keys(STATUS_LABEL_KEYS) as Array<
  keyof typeof STATUS_LABEL_KEYS
>;

interface Props {
  announcements: TopicAnnouncementRecord[];
  canSend: boolean;
  contacts: TopicAnnouncementContact[];
  isCreating: boolean;
  isLoading: boolean;
  isSending: boolean;
  onCreate: (payload: TopicAnnouncementPayload) => void;
  onPageChange: (page: number) => void;
  onQueryChange: (query: string) => void;
  onSend: (announcementId: string) => void;
  onStatusChange: (status: string) => void;
  page: number;
  query: string;
  status: string;
  totalPages: number;
}

export function AnnouncementsPanel({
  announcements,
  canSend,
  contacts,
  isCreating,
  isLoading,
  isSending,
  onCreate,
  onPageChange,
  onQueryChange,
  onSend,
  onStatusChange,
  page,
  query,
  status,
  totalPages,
}: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="space-y-4">
      <AnnouncementForm
        contacts={contacts}
        isCreating={isCreating}
        onCreate={onCreate}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-sm"
          placeholder={t('search')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(STATUS_LABEL_KEYS[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AnnouncementTable
        announcements={announcements}
        canSend={canSend}
        isLoading={isLoading}
        isSending={isSending}
        onSend={onSend}
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          variant="outline"
        >
          {t('previous')}
        </Button>
        <span className="text-muted-foreground text-sm">
          {t('page_count', {
            page: page.toString(),
            total: totalPages.toString(),
          })}
        </span>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          variant="outline"
        >
          {t('next')}
        </Button>
      </div>
    </div>
  );
}
