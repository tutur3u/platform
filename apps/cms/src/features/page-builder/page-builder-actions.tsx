'use client';

import {
  type CmsPage,
  toCmsPageVersionPayload,
} from '@tuturuuu/cms-blocks/schema';
import { Save, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import {
  getVisiblePageBuilderActions,
  type PageBuilderActionProps,
  type PageVersionHandler,
} from './page-builder-permissions';

export function PageBuilderActions({
  page,
  ...props
}: PageBuilderActionProps & { page: CmsPage }) {
  const t = useTranslations('external-projects.page_builder');
  const [pending, startTransition] = useTransition();
  const visible = getVisiblePageBuilderActions(props);

  function run(handler: PageVersionHandler | undefined, done: string) {
    if (!handler) return;
    startTransition(async () => {
      try {
        await handler(toCmsPageVersionPayload(page));
        toast.success(done);
      } catch {
        toast.error(t('action_failed'));
      }
    });
  }

  return (
    <>
      {visible.saveDraft ? (
        <Button
          disabled={pending}
          onClick={() => run(props.onSaveDraft, t('draft_saved'))}
          variant="outline"
        >
          <Save className="size-4" />
          {t('save_draft')}
        </Button>
      ) : null}
      {visible.publish ? (
        <Button
          disabled={pending}
          onClick={() => run(props.onPublish, t('published'))}
        >
          <Send className="size-4" />
          {t('publish')}
        </Button>
      ) : null}
    </>
  );
}
