'use client';

import { Search, SlidersHorizontal } from '@tuturuuu/icons';
import type {
  TopicAnnouncementContact,
  TopicAnnouncementPayload,
  TopicAnnouncementRecord,
  TopicAnnouncementTemplateRecord,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { uploadTopicAnnouncementAttachment } from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
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
import { useState } from 'react';
import { AnnouncementForm } from './announcement-form';
import { AnnouncementTable } from './announcement-table';
import type { TemplateFormValues } from './template-form-dialog';
import { TopicAnnouncementEmailPreviewDialog } from './topic-announcement-email-preview-dialog';

const STATUS_LABEL_KEYS = {
  active: 'status_active',
  all: 'status_all',
  cancelled: 'status_cancelled',
  draft: 'status_draft',
  failed: 'status_failed',
  queued: 'status_queued',
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
  groups: UserGroup[];
  isCreating: boolean;
  isDeleting: boolean;
  isLoading: boolean;
  isSavingTemplate: boolean;
  isScheduling: boolean;
  isSending: boolean;
  onCancelSchedule: (announcementId: string) => void;
  onCreate: (payload: TopicAnnouncementPayload) => Promise<void>;
  onCreateAndSchedule: (
    payload: TopicAnnouncementPayload,
    scheduledSendAt: string
  ) => Promise<void>;
  onCreateAndSend: (payload: TopicAnnouncementPayload) => Promise<void>;
  onDelete: (announcementId: string) => void;
  onPageChange: (page: number) => void;
  onQueryChange: (query: string) => void;
  onSaveTemplate: (values: TemplateFormValues) => void;
  onSchedule: (announcementId: string, scheduledSendAt: string) => void;
  onSend: (announcementId: string) => void;
  onStatusChange: (status: string) => void;
  onTimezoneRequired: () => void;
  page: number;
  pageSize: number;
  query: string;
  schedulingTimezone: string | null;
  status: string;
  templates: TopicAnnouncementTemplateRecord[];
  totalPages: number;
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

export function AnnouncementsPanel({
  announcements,
  canSend,
  contacts,
  groups,
  isCreating,
  isDeleting,
  isLoading,
  isSavingTemplate,
  isScheduling,
  isSending,
  onCancelSchedule,
  onCreate,
  onCreateAndSchedule,
  onCreateAndSend,
  onDelete,
  onPageChange,
  onQueryChange,
  onSaveTemplate,
  onSchedule,
  onSend,
  onStatusChange,
  onTimezoneRequired,
  page,
  pageSize,
  query,
  schedulingTimezone,
  status,
  templates,
  totalPages,
  workspaceUsers,
  wsId,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const [previewTarget, setPreviewTarget] =
    useState<TopicAnnouncementRecord | null>(null);
  const [forkSeed, setForkSeed] = useState<{
    announcement: TopicAnnouncementRecord;
    seedId: number;
  } | null>(null);

  return (
    <div className="space-y-4">
      <div id="topic-announcement-composer">
        <AnnouncementForm
          canSend={canSend}
          contacts={contacts}
          forkSeedId={forkSeed?.seedId ?? null}
          forkSource={forkSeed?.announcement ?? null}
          groups={groups}
          isCreating={isCreating}
          isSavingTemplate={isSavingTemplate}
          isScheduling={isScheduling}
          isSending={isSending}
          onCreate={onCreate}
          onCreateAndSchedule={onCreateAndSchedule}
          onCreateAndSend={onCreateAndSend}
          onSaveTemplate={onSaveTemplate}
          onTimezoneRequired={onTimezoneRequired}
          onUploadAttachment={(file) =>
            uploadTopicAnnouncementAttachment(wsId, file).then(
              (response) => response.data
            )
          }
          schedulingTimezone={schedulingTimezone}
          templates={templates}
          workspaceUsers={workspaceUsers}
          wsId={wsId}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-background p-3 md:flex-row md:items-center md:justify-between">
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('search')}
            value={query}
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <Select onValueChange={onStatusChange} value={status}>
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
      </div>

      <AnnouncementTable
        announcements={announcements}
        canSend={canSend}
        isLoading={isLoading}
        isDeleting={isDeleting}
        isScheduling={isScheduling}
        isSending={isSending}
        firstRowNumber={(page - 1) * pageSize + 1}
        onCancelSchedule={onCancelSchedule}
        onDelete={onDelete}
        onFork={(announcement) => {
          setForkSeed({ announcement, seedId: Date.now() });
          document
            .getElementById('topic-announcement-composer')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onPreview={setPreviewTarget}
        onSchedule={onSchedule}
        onSend={onSend}
        onTimezoneRequired={onTimezoneRequired}
        schedulingTimezone={schedulingTimezone}
        wsId={wsId}
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

      <TopicAnnouncementEmailPreviewDialog
        announcement={previewTarget}
        onOpenChange={(open) => {
          if (!open) setPreviewTarget(null);
        }}
        open={Boolean(previewTarget)}
        wsId={wsId}
      />
    </div>
  );
}
