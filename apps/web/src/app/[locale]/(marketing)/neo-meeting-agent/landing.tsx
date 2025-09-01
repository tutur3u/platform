'use client';

import { LanguageSelect } from './language-select';
import { MeetingHistory } from './meeting-history';
import { Button } from '@ncthub/ui/button';
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from '@ncthub/ui/dropzone';
import { UploadIcon } from 'lucide-react';
import { useState } from 'react';

type LandingTranslations = {
  dropzoneTitle: string;
  dropzoneCaption: string;
  generateButton: string;
  historyTitle: string;
  historyViewMore: string;
  languageLabels: {
    english: string;
    vietnamese: string;
  };
};

export default function NeoMeetingAgentLanding({
  translations,
}: {
  translations: LandingTranslations;
}) {
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
          className="h-64 border-2 border-dashed transition-colors duration-300 hover:bg-muted/25"
        >
          <DropzoneContent />
          <DropzoneEmptyState>
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full border border-dashed p-3">
                <UploadIcon
                  className="size-7 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-4 font-medium text-muted-foreground">
                {translations.dropzoneTitle}
              </p>
              <p className="mt-2 text-sm text-muted-foreground/70">
                {translations.dropzoneCaption}
              </p>
            </div>
          </DropzoneEmptyState>
        </Dropzone>

        <div className="grid w-full grid-cols-2 items-center gap-4">
          <LanguageSelect
            onValueChange={setLanguage}
            defaultValue={language}
            languageLabels={translations.languageLabels}
          />
          <Button className="bg-gradient-to-r from-orange-500 to-yellow-400 bg-[length:200%_auto] text-base font-bold text-white transition-all duration-500 ease-in-out hover:bg-[position:100%_0%]">
            {translations.generateButton}
          </Button>
        </div>
      </div>

      {/* right column */}
      <div>
        <MeetingHistory
          title={translations.historyTitle}
          viewMoreText={translations.historyViewMore}
        />
      </div>
    </div>
  );
}
