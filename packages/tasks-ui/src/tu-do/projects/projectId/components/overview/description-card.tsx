'use client';

import { Edit2, Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useProjectOverview } from '../project-overview-context';

export function OverviewDescription() {
  const t = useTranslations('task_project_detail.overview');
  const {
    editedDescription,
    setEditedDescription,
    isEditingDescription,
    setIsEditingDescription,
    showConfiguration,
    setShowConfiguration,
    fadeInViewVariant,
  } = useProjectOverview();

  return (
    <motion.div {...fadeInViewVariant(0)}>
      <Card className="group relative rounded-lg bg-background p-5 shadow-none">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-base">{t('description')}</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => setIsEditingDescription(true)}
              aria-label={t('edit_description_aria')}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfiguration(!showConfiguration)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              {showConfiguration
                ? t('hide_configuration')
                : t('show_configuration')}
            </Button>
          </div>
        </div>

        {isEditingDescription ? (
          <div className="space-y-3">
            <Textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              placeholder={t('describe_placeholder')}
              className="min-h-50 resize-none"
              autoFocus
            />
            <p className="text-muted-foreground text-xs">
              {t('rich_text_note')}
            </p>
          </div>
        ) : editedDescription ? (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80">
            {editedDescription}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            {t('no_description')}
          </p>
        )}
      </Card>
    </motion.div>
  );
}
