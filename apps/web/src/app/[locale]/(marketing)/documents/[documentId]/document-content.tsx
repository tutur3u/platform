'use client';

import { TailwindAdvancedEditor } from '@/app/[locale]/(dashboard)/[wsId]/documents/advanced-editor';
import { WorkspaceDocument } from '@/types/db';
import { Card } from '@repo/ui/components/ui/card';
import { JSONContent } from 'novel';

interface Props {
  document: WorkspaceDocument;
}

function DocumentPageContent({ document }: Props) {
  return (
    <div className="pb-32 md:pt-10">
      <div className="mx-auto max-w-6xl">
        <Card className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold">{document.name}</h1>
            </div>
          </div>

          <div className="bg-background/50 relative min-h-[500px] w-full rounded-lg border">
            <TailwindAdvancedEditor
              content={document.content as JSONContent}
              disableLocalStorage
              previewMode
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

export default DocumentPageContent;