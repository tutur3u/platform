'use client';

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
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-sm"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('search')}
          value={query}
        />
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
      />
    </div>
  );
}
