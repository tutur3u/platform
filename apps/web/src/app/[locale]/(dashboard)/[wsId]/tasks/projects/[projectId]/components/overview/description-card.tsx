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
      <Card className="group relative border-2 border-dynamic-purple/20 bg-dynamic-purple/5 p-6 transition-all hover:border-dynamic-purple/30 hover:shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text font-bold text-lg text-transparent">
            {t('description')}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => setIsEditingDescription(true)}
              aria-label={t('edit_description_aria')}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfiguration(!showConfiguration)}
              className="border-dynamic-purple/30 transition-all hover:border-dynamic-purple/50 hover:bg-dynamic-purple/10"
            >
              <Settings className="mr-2 h-4 w-4" />
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
