'use client';

import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buildMindWorkspaceHref } from '../../routes';

type MindBoardSelectPromptProps = {
  mindPrefix?: string;
  workspaceSlug: string;
};

export function MindBoardSelectPrompt({
  mindPrefix,
  workspaceSlug,
}: MindBoardSelectPromptProps) {
  const t = useTranslations('mind');
  const href = buildMindWorkspaceHref({ mindPrefix, workspaceSlug });

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="max-w-md text-muted-foreground text-sm">
        {t('emptyState.description')}
      </p>
      <Button asChild variant="outline">
        <Link href={href}>{t('emptyState.title')}</Link>
      </Button>
    </div>
  );
}
