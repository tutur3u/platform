'use client';

import { Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function DisconnectDiscordDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: Props) {
  const t = useTranslations('integrations-page');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          className="w-full transition-all duration-200 hover:scale-[1.02]"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('discord-disconnect-trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('discord-disconnect-title')}</DialogTitle>
          <DialogDescription>
            {t('discord-disconnect-description')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('discord-disconnect-cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading
              ? t('discord-disconnect-pending')
              : t('discord-disconnect-confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
