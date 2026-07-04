import { Globe2, Loader2 } from '@tuturuuu/icons';
import type { WorkspaceDocument } from '@tuturuuu/types';
import type { Locale } from '../../lib/platform/locale';

export type PublicDocumentPreview = Pick<
  WorkspaceDocument,
  'content' | 'created_at' | 'id' | 'is_public' | 'name'
>;

type DocumentMessages = {
  loading: string;
  publicDocument: string;
};

const documentMessagesByLocale: Record<Locale, DocumentMessages> = {
  en: {
    loading: 'Loading',
    publicDocument: 'Public document',
  },
  vi: {
    loading: 'Đang tải',
    publicDocument: 'Tài liệu công khai',
  },
};

export function getDocumentMessages(locale: Locale) {
  return documentMessagesByLocale[locale];
}

export function DocumentPageContent({
  document,
  locale,
}: {
  document: PublicDocumentPreview | null;
  locale: Locale;
}) {
  const messages = getDocumentMessages(locale);

  if (!document) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-root-background text-dynamic-foreground">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
        <span className="ml-2">{messages.loading}...</span>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-root-background text-dynamic-foreground">
      <div className="sticky top-0 z-50 flex h-14 items-center justify-center border-dynamic-border/60 border-b bg-background">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <h1 className="font-medium text-lg">{document.name}</h1>
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-dynamic-green text-sm">
                <Globe2 aria-hidden="true" className="h-4 w-4" />
                {messages.publicDocument}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-auto py-6">
        <div className="mx-auto max-w-(--breakpoint-xl) px-4">
          <div className="rounded-lg border border-dynamic-border/60 bg-background p-6 shadow-sm" />
        </div>
      </div>
    </div>
  );
}
