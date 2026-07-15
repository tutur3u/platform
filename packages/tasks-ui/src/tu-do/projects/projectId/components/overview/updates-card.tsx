'use client';

import { ChevronRight, Loader2, Sparkles } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useProjectOverview } from '../project-overview-context';

export function OverviewUpdates() {
  const t = useTranslations('task_project_detail.overview');
  const { recentUpdates, isLoadingUpdates, setActiveTab, fadeInViewVariant } =
    useProjectOverview();

  return (
    <motion.div {...fadeInViewVariant(0.2)}>
      <Card className="rounded-lg bg-background p-5 shadow-none">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-base">{t('recent_updates')}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('updates')}
            className="gap-1"
          >
            {t('view_all')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoadingUpdates ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : recentUpdates.length > 0 ? (
          <div className="space-y-3">
            {recentUpdates.map((update) => (
              <div
                key={update.id}
                className="cursor-pointer rounded-md border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                onClick={() => setActiveTab('updates')}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={update.creator?.avatar_url || undefined}
                    />
                    <AvatarFallback className="text-xs">
                      {update.creator?.display_name?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm">
                    {update.creator?.display_name || t('unknown_user')}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(update.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="line-clamp-2 text-foreground/70 text-sm">
                  {update.content}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {t('no_updates_yet')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab('updates')}
              className="mt-2"
            >
              {t('post_update')}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
