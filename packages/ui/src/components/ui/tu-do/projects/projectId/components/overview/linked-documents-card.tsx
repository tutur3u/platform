'use client';

import { ChevronRight, FileText } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { PriorityBadge } from '../../../components/project-badges';
import { useProjectOverview } from '../project-overview-context';

export function OverviewLinkedDocuments() {
  const t = useTranslations('task_project_detail.overview');
  const { documents, setActiveTab, fadeInViewVariant } = useProjectOverview();
  const recentDocuments = documents.slice(0, 4);

  return (
    <motion.div {...fadeInViewVariant(0.35)}>
      <Card className="rounded-lg bg-background p-5 shadow-none">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base">
                {t('linked_documents')}
              </h2>
              <p className="text-muted-foreground text-xs">
                {t('linked_documents_description')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('documents')}
            className="gap-1"
          >
            {t('view_all')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {recentDocuments.length > 0 ? (
          <div className="space-y-2">
            {recentDocuments.map((document) => (
              <div
                key={document.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-medium text-sm">
                    {document.name}
                  </h4>
                  <p className="truncate text-muted-foreground text-xs">
                    {document.source_list_name ?? t('document_list')}
                  </p>
                </div>
                {document.priority ? (
                  <PriorityBadge priority={document.priority} />
                ) : (
                  <Badge variant="outline" className="rounded-md">
                    {t('document')}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed py-8 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">
              {t('no_documents_linked')}
            </p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
