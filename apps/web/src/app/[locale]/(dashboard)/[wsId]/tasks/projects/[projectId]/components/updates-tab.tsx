'use client';

import { Loader2, Send, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { UpdateCard } from './update-card';
import type { ProjectUpdate } from '../types';

interface UpdatesTabProps {
  updates: ProjectUpdate[];
  isLoadingUpdates: boolean;
  newUpdateContent: string;
  setNewUpdateContent: (value: string) => void;
  isPostingUpdate: boolean;
  postUpdate: () => void;
  currentUserId: string;
  editingUpdateId: string | null;
  editingUpdateContent: string;
  setEditingUpdateContent: (value: string) => void;
  isDeletingUpdateId: string | null;
  startEditingUpdate: (update: ProjectUpdate) => void;
  deleteUpdate: (updateId: string) => void;
  saveEditedUpdate: (updateId: string) => void;
  cancelEditingUpdate: () => void;
  fadeInViewVariant: (delay?: number) => object;
}

export function UpdatesTab({
  updates,
  isLoadingUpdates,
  newUpdateContent,
  setNewUpdateContent,
  isPostingUpdate,
  postUpdate,
  currentUserId,
  editingUpdateId,
  editingUpdateContent,
  setEditingUpdateContent,
  isDeletingUpdateId,
  startEditingUpdate,
  deleteUpdate,
  saveEditedUpdate,
  cancelEditingUpdate,
  fadeInViewVariant,
}: UpdatesTabProps) {
  const t = useTranslations('task_project_detail.updates_tab');
  return (
    <div className="mx-auto space-y-6">
      {/* Post Update Form */}
      <motion.div {...fadeInViewVariant(0)}>
        <Card className="border-2 border-dynamic-purple/20 bg-dynamic-purple/5 p-6">
          <h3 className="mb-4 bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text font-semibold text-lg text-transparent">
            {t('share_update')}
          </h3>
          <div className="space-y-3">
            <Textarea
              value={newUpdateContent}
              onChange={(e) => setNewUpdateContent(e.target.value)}
              placeholder={t('share_placeholder')}
              className="min-h-30 resize-none border-dynamic-purple/30"
              disabled={isPostingUpdate}
            />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                {t('rich_text_coming_soon')}
              </p>
              <Button
                onClick={postUpdate}
                disabled={isPostingUpdate || !newUpdateContent.trim()}
                className="bg-linear-to-r from-dynamic-purple to-dynamic-pink shadow-lg transition-all hover:shadow-xl"
              >
                {isPostingUpdate ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('posting')}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {t('post_update')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Updates Feed */}
      {isLoadingUpdates ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-dynamic-purple" />
        </div>
      ) : updates.length > 0 ? (
        <div className="space-y-4">
          {updates.map((update, index) => (
            <UpdateCard
              key={update.id}
              update={update}
              currentUserId={currentUserId}
              isEditing={editingUpdateId === update.id}
              isDeleting={isDeletingUpdateId === update.id}
              editingContent={editingUpdateContent}
              onEdit={() => startEditingUpdate(update)}
              onDelete={() => deleteUpdate(update.id)}
              onSave={() => saveEditedUpdate(update.id)}
              onCancel={cancelEditingUpdate}
              onContentChange={setEditingUpdateContent}
              fadeInVariant={fadeInViewVariant(index * 0.1)}
            />
          ))}
        </div>
      ) : (
        <motion.div {...fadeInViewVariant(0.1)}>
          <Card className="border-2 border-muted/20 p-12 text-center">
            <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 font-semibold text-lg">{t('no_updates_title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('no_updates_description')}
            </p>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
