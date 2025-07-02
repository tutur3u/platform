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
      className="h-9 bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
    >
      <PenSquare className="mr-2 h-4 w-4" />
      {t('mail.compose')}
    </Button>
  );
}
