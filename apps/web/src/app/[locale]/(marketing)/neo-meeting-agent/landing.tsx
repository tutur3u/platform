'use client';

import { LanguageSelect } from './language-select';
import { MeetingHistory } from './meeting-history';
import { Button } from '@ncthub/ui/button';
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from '@ncthub/ui/dropzone';
import { UploadIcon } from '@ncthub/ui/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function NeoMeetingAgentLanding() {
  const t = useTranslations('neo-meeting-agent');

  const [files, setFiles] = useState<File[] | undefined>();
  const [language, setLanguage] = useState<string>('english');

  const handleDrop = (files: File[]) => {
    setFiles(files);
  };

  return (
    <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2">
      {/* left column */}
      <div className="flex flex-col gap-4">
        <Dropzone
          accept={{ 'video/*': [] }}
          maxFiles={1}
          maxSize={1024 * 1024 * 50} // 50MB
          minSize={1024}
          src={files}
          onDrop={handleDrop}
          className="hover:bg-muted/25 h-64 border-2 border-dashed transition-colors duration-300"
        >
          <DropzoneContent />
          <DropzoneEmptyState>
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full border border-dashed p-3">
                <UploadIcon
                  className="text-muted-foreground size-7"
                  aria-hidden="true"
                />
              </div>
              <p className="text-muted-foreground mt-4 font-medium">
                {t('dropzone.title')}
              </p>
              <p className="text-muted-foreground/70 mt-2 text-sm">
                {t('dropzone.caption', { size: 50 })}
              </p>
            </div>
          </DropzoneEmptyState>
        </Dropzone>

        <div className="grid w-full grid-cols-2 items-center gap-4">
          <LanguageSelect onValueChange={setLanguage} defaultValue={language} />
          <Button className="bg-linear-to-r bg-size-[200%_auto] hover:bg-position-[100%_0%] from-orange-500 to-yellow-400 text-base font-bold text-white transition-all duration-500 ease-in-out">
            {t('actions.generate')}
          </Button>
        </div>
      </div>

      {/* right column */}
      <div>
        <MeetingHistory
          title={t('history.title')}
          viewMoreText={t('history.view_more')}
        />
      </div>
    </div>
  );
}
