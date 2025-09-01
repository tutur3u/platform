'use client';

import { LanguageSelect } from './language-select';
import { Button } from '@ncthub/ui/button';
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from '@ncthub/ui/dropzone';
import { UploadIcon } from 'lucide-react';
import { useState } from 'react';

export default function NeoMeetingAgentLanding() {
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
                Drag 'n' drop meeting video, or click to select a file
              </p>
              <p className="mt-2 text-sm text-muted-foreground/70">
                You can upload a file up to 50MB
              </p>
            </div>
          </DropzoneEmptyState>
        </Dropzone>

        <div className="grid w-full grid-cols-2 items-center gap-4">
          <LanguageSelect onValueChange={setLanguage} defaultValue={language} />
          <Button className="bg-gradient-to-r from-orange-500 to-yellow-400 bg-[length:200%_auto] text-base font-bold text-white transition-all duration-500 ease-in-out hover:bg-[position:100%_0%]">
            Generate Minutes
          </Button>
        </div>
      </div>

      {/* right column */}
      <div></div>
    </div>
  );
}
