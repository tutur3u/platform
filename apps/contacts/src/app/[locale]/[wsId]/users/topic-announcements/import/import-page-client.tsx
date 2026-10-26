'use client';

import { Download } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { TeacherScheduleImportPanel } from '../teacher-schedule-import';
import {
  downloadTopicAnnouncementTemplate,
  ImportPanel,
} from '../topic-announcements-import';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { useTopicAnnouncements } from '../topic-announcements-shell';

export function TopicAnnouncementsImportPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const {
    actions,
    canSend,
    contacts,
    importResult,
    pending,
    teacherAssignmentsEnabled,
    wsId,
  } = useTopicAnnouncements();

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        description={t('import_page_description')}
        actions={
          <Button
            className="gap-2"
            onClick={downloadTopicAnnouncementTemplate}
            type="button"
            variant="outline"
          >
            <Download className="h-4 w-4" />
            {t('download_template')}
          </Button>
        }
      />

      {teacherAssignmentsEnabled ? (
        <TeacherScheduleImportPanel
          canSend={canSend}
          contacts={contacts}
          importResult={importResult}
          isImporting={pending.importRows}
          isSending={pending.importAndSendRows}
          onImportAndSend={actions.importAndSendRows}
          onImport={actions.importRows}
          wsId={wsId}
        />
      ) : (
        <ImportPanel
          canSend={canSend}
          importResult={importResult}
          isImporting={pending.importRows}
          isSending={pending.importAndSendRows}
          onImportAndSend={actions.importAndSendRows}
          onImport={actions.importRows}
        />
      )}
    </div>
  );
}
