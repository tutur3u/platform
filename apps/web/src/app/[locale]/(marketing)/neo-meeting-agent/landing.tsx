'use client';

import { FileUploader, type StatedFile } from '@ncthub/ui/custom/file-uploader';
import { useState } from 'react';

export default function NeoMeetingAgentLanding() {
  const [files, setFiles] = useState<StatedFile[]>([]);

  return (
    <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2">
      {/* left column */}
      <div className="flex flex-col gap-6">
        <FileUploader
          value={files}
          onValueChange={setFiles}
          // onUpload={}
          maxFileCount={1}
          maxSize={1024 * 1024 * 1024 * 2}
        />
      </div>

      {/* right column */}
      <div></div>
    </div>
  );
}
