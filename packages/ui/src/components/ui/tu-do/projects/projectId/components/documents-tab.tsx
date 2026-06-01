'use client';

import { FileText } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { PriorityBadge } from '../../components/project-badges';

interface DocumentsTabProps {
  documents: Task[];
  fadeInViewVariant: (delay?: number) => object;
}

export function DocumentsTab({
  documents,
  fadeInViewVariant,
}: DocumentsTabProps) {
  const t = useTranslations('task_project_detail.documents_tab');

  if (documents.length === 0) {
    return (
      <motion.div
        {...fadeInViewVariant(0.1)}
        className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/20 p-8 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-background">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-1">
          <h2 className="font-semibold text-lg">{t('empty_title')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('empty_description')}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeInViewVariant(0.1)} className="space-y-4 p-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold text-xl">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('description', { count: documents.length })}
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-md">
          {documents.length} {t('documents')}
        </Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {documents.map((document) => (
          <Card
            key={document.id}
            className="group rounded-lg bg-background p-4 shadow-none transition-colors hover:bg-muted/30"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <h3 className="truncate font-semibold text-sm">
                    {document.name}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {document.source_list_name ?? t('document_list')}
                  </p>
                </div>
                {document.description ? (
                  <p className="line-clamp-2 text-muted-foreground text-sm">
                    {getDescriptionText(document.description)}
                  </p>
                ) : null}
                {document.priority ? (
                  <PriorityBadge priority={document.priority} />
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
