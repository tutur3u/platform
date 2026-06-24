'use client';

import { ChevronLeft, FileText, Globe2, Lock } from '@tuturuuu/icons';
import type { WorkspaceDocumentDetail } from '@tuturuuu/internal-api';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'use-intl';
import { Link } from '@/lib/platform/next-link-shim';

type WorkspaceDocumentDetailPageProps = {
  document: WorkspaceDocumentDetail;
  locale: string;
  routeWorkspaceId: string;
};

export function WorkspaceDocumentDetailPage({
  document,
  locale,
  routeWorkspaceId,
}: WorkspaceDocumentDetailPageProps) {
  const t = useTranslations();
  const content = normalizeDocumentContent(document.content);
  const displayName = document.name || t('documents.untitled-document');
  const createdAt = formatDocumentDate(document.created_at, locale);
  const documentsHref = `/${locale}/${routeWorkspaceId}/documents`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <div>
        <Button asChild size="sm" variant="ghost">
          <Link href={documentsHref}>
            <ChevronLeft className="h-4 w-4" />
            {t('documents.back-to-documents')}
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-4 border-border border-b pb-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <FileText className="h-4 w-4" />
            <span>{t('documents.documents')}</span>
          </div>
          <h1 className="break-words font-semibold text-3xl tracking-normal">
            {displayName}
          </h1>
          {createdAt ? (
            <p className="text-muted-foreground text-sm">
              {t('common.created_at')}: {createdAt}
            </p>
          ) : null}
        </div>

        <Badge className="w-fit" variant="outline">
          {document.is_public ? (
            <>
              <Globe2 className="h-3.5 w-3.5" />
              {t('common.public_document')}
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" />
              {t('common.private_document')}
            </>
          )}
        </Badge>
      </header>

      <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-medium text-lg">{t('documents.preview')}</h2>
        </div>

        {content ? (
          <RichTextEditor
            className="border-none bg-transparent p-0"
            content={content}
            readOnly
          />
        ) : (
          <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
            {t('documents.empty-preview')}
          </div>
        )}
      </section>
    </div>
  );
}

function normalizeDocumentContent(
  content: WorkspaceDocumentDetail['content']
): JSONContent | null {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as JSONContent)
        : textToDocumentContent(content);
    } catch {
      return textToDocumentContent(content);
    }
  }

  if (typeof content === 'object') {
    return content as JSONContent;
  }

  return textToDocumentContent(String(content));
}

function textToDocumentContent(text: string): JSONContent | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  return {
    content: [
      {
        content: [{ text: trimmed, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

function formatDocumentDate(value: string | null, locale: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString(locale, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
