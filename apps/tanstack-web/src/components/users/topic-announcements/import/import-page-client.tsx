'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Megaphone } from '@tuturuuu/icons';
import {
  importTopicAnnouncements,
  sendTopicAnnouncementsBulk,
  type TopicAnnouncementImportPayload,
  type TopicAnnouncementImportResult,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  downloadTopicAnnouncementTemplate,
  ImportPanel,
} from '../topic-announcements-import';

interface TopicAnnouncementsImportPageClientProps {
  canSend: boolean;
  locale: string;
  wsId: string;
}

export function TopicAnnouncementsImportPageClient({
  canSend,
  wsId,
}: TopicAnnouncementsImportPageClientProps) {
  const t = useTranslations('ws-topic-announcements');
  const queryClient = useQueryClient();
  const [importResult, setImportResult] =
    useState<TopicAnnouncementImportResult | null>(null);

  const invalidateAnnouncementData = () => {
    for (const queryKey of [
      ['topic-announcements', wsId],
      ['topic-announcement-contacts', wsId],
      ['topic-announcements-delivered', wsId],
      ['topic-announcement-templates', wsId],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const importMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementImportPayload) =>
      importTopicAnnouncements(wsId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('import_failed')),
    onSuccess: (result) => {
      toast.success(
        t('imported', { count: result.createdAnnouncements.toString() })
      );
      setImportResult(result);
      invalidateAnnouncementData();
    },
  });

  const importAndSendMutation = useMutation({
    mutationFn: async (payload: TopicAnnouncementImportPayload) => {
      const importedRows = await importTopicAnnouncements(wsId, payload);
      const announcementIds = importedRows.announcementIds ?? [];
      if (announcementIds.length === 0) {
        return { importResult: importedRows, sendResult: null };
      }

      try {
        const sendResult = await sendTopicAnnouncementsBulk(wsId, {
          announcementIds,
        });

        return { importResult: importedRows, sendResult };
      } catch (error) {
        return {
          importResult: importedRows,
          sendError: error,
          sendResult: null,
        };
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('send_failed')),
    onSuccess: ({ importResult: nextImportResult, sendError, sendResult }) => {
      const sentCount =
        sendResult?.results.filter((result) => !result.error).length ?? 0;
      setImportResult(nextImportResult);
      invalidateAnnouncementData();

      if (sendError) {
        toast.error(
          sendError instanceof Error ? sendError.message : t('send_failed')
        );
        return;
      }

      toast.success(
        t('bulk_created_and_sent', {
          created: nextImportResult.createdAnnouncements.toString(),
          sent: sentCount.toString(),
        })
      );
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <p className="max-w-3xl text-muted-foreground text-sm">
            {t('import_page_description')}
          </p>
          <Button
            className="gap-2"
            onClick={downloadTopicAnnouncementTemplate}
            type="button"
            variant="outline"
          >
            <Download className="h-4 w-4" />
            {t('download_template')}
          </Button>
        </div>

        <ImportPanel
          canSend={canSend}
          importResult={importResult}
          isImporting={importMutation.isPending}
          isSending={importAndSendMutation.isPending}
          onImport={(payload) => importMutation.mutate(payload)}
          onImportAndSend={(payload) => importAndSendMutation.mutate(payload)}
        />
      </div>
    </div>
  );
}
