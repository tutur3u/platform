'use client';

import { Button } from '@tuturuuu/ui/button';
import { PenSquare } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface ComposeButtonProps {
  onClick: () => void;
}

export function ComposeButton({ onClick }: ComposeButtonProps) {
  const t = useTranslations();

  return (
    <Button
      onClick={onClick}
      size="sm"
      variant="default"
      disabled
      className="px-4 py-2 h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <PenSquare className="mr-2 h-4 w-4" />
      {t('mail.compose')}
    </Button>
  );
}
