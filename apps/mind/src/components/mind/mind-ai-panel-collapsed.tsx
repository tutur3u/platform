'use client';

import { Bot, PanelRightOpen } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

type Props = {
  onToggleCollapsed: () => void;
};

export function MindAiPanelCollapsed({ onToggleCollapsed }: Props) {
  const t = useTranslations('mind');

  return (
    <aside className="flex min-h-0 flex-col items-center gap-2 border-border border-l bg-card/70 p-2">
      <Button
        aria-label={t('actions.openAi')}
        onClick={onToggleCollapsed}
        size="icon"
        type="button"
        variant="ghost"
      >
        <PanelRightOpen className="h-4 w-4" />
      </Button>
      <Bot className="mt-2 h-4 w-4 text-muted-foreground" />
    </aside>
  );
}
