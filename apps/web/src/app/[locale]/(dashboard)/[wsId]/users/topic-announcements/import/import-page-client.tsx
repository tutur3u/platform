'use client';

import { Download } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  downloadTopicAnnouncementTemplate,
  ImportPanel,
} from '../topic-announcements-import';
import { TopicAnnouncementsPageHeader } from '../topic-announcements-page-header';
import { useTopicAnnouncements } from '../topic-announcements-shell';

export function TopicAnnouncementsImportPageClient() {
  const t = useTranslations('ws-topic-announcements');
  const { actions, importResult, pending } = useTopicAnnouncements();

  return (
    <div className="space-y-4">
      <TopicAnnouncementsPageHeader
        description={t('import_page_description')}
        title={t('nav_import')}
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

      <ImportPanel
        importResult={importResult}
        isImporting={pending.importRows}
        onImport={actions.importRows}
      />
    </div>
  );
}
