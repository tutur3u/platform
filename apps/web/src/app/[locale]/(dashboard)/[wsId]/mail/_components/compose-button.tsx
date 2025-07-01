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
    <Button onClick={onClick} size="sm" variant="default" disabled>
      <PenSquare className="mr-2 h-4 w-4" />
      {t('mail.compose')}
    </Button>
  );
}
