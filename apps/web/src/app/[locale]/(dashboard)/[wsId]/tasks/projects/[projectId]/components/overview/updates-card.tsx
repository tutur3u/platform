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
  const {
    recentUpdates,
    isLoadingUpdates,
    setActiveTab,
    fadeInViewVariant,
  } = useProjectOverview();

  return (
    <motion.div {...fadeInViewVariant(0.2)}>
      <Card className="border-2 border-dynamic-pink/20 bg-dynamic-pink/5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="bg-linear-to-r from-dynamic-pink to-dynamic-purple bg-clip-text font-bold text-lg text-transparent">
            {t('recent_updates')}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('updates')}
            className="gap-1 text-dynamic-pink hover:text-dynamic-pink"
          >
            {t('view_all')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoadingUpdates ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-dynamic-pink" />
          </div>
        ) : recentUpdates.length > 0 ? (
          <div className="space-y-3">
            {recentUpdates.map((update) => (
              <div
                key={update.id}
                className="cursor-pointer rounded-lg border border-dynamic-pink/20 bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:border-dynamic-pink/30 hover:bg-dynamic-pink/5"
                onClick={() => setActiveTab('updates')}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={update.creator?.avatar_url || undefined}
                    />
                    <AvatarFallback className="text-xs">
                      {update.creator?.display_name?.[0]?.toUpperCase() ||
                        'U'}
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
              className="mt-2 text-dynamic-pink hover:text-dynamic-pink"
            >
              {t('post_update')}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
