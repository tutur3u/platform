'use client';

import { Pencil } from '@tuturuuu/icons';
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { useUpdateMiraSoul } from '../hooks/use-mira-soul';

interface MiraNameBadgeProps {
  currentName: string;
  className?: string;
  children?: ReactNode;
}

export default function MiraNameBadge({
  currentName,
  className,
  children,
}: MiraNameBadgeProps) {
  const t = useTranslations('dashboard.assistant_name');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const updateSoul = useUpdateMiraSoul();

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      setOpen(false);
      return;
    }

    updateSoul.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          toast.success(t('updated'));
          setOpen(false);
        },
        onError: () => {
          toast.error(t('error'));
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ? (
          <button
            type="button"
            className={cn(
              'inline-flex items-center rounded-md transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60',
              className
            )}
          >
            {children}
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('edit_title')}
            title={t('edit_title')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground',
              className
            )}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('edit_title')}</DialogTitle>
          <DialogDescription>{t('edit_description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="assistant-name">{t('name_label')}</Label>
          <Input
            id="assistant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateSoul.isPending || !name.trim()}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
