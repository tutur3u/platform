'use client';

import { BlockEditor } from '@/components/components/BlockEditor';
import { WorkspaceDocument } from '@tutur3u/types/db';
import { Globe2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
  document: WorkspaceDocument;
}

export default function DocumentPageContent({ document }: Props) {
  const t = useTranslations();

  if (!document) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">{t('common.loading')}...</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col">
      <div className="sticky top-0 z-50 flex h-14 items-center justify-center bg-background">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-medium">{document.name}</h1>
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-emerald-500">
                <Globe2 className="h-4 w-4" />
                {t('common.public_document')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-auto py-6">
        <div className="mx-auto max-w-screen-xl px-4">
          <div className="rounded-lg border bg-background p-6 shadow-sm">
            <BlockEditor document={document.content as any} editable={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
