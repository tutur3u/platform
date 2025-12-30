'use client';

import { Check } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { computeAccessibleLabelStyles } from '@tuturuuu/ui/tu-do/utils/label-colors';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { type TaskLabel, colorPresets } from '../types';

interface LabelDialogProps {
  label: TaskLabel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; color: string }) => Promise<void>;
  isSubmitting: boolean;
}

export function LabelDialog({
  label,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: LabelDialogProps) {
  const t = useTranslations('ws-tasks-labels');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [formData, setFormData] = useState<{
    name: string;
    color: string;
  }>({
    name: '',
    color: colorPresets[0] || '#EF4444',
  });

  useEffect(() => {
    if (label) {
      setFormData({
        name: label.name,
        color: label.color,
      });
    } else {
      setFormData({
        name: '',
        color: colorPresets[0] || '#EF4444',
      });
    }
  }, [label, open]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    await onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {label ? t('edit_label') : t('create_label')}
          </DialogTitle>
          <DialogDescription>
            {label ? t('edit_description') : t('create_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t('label_name')}</Label>
            <Input
              id="name"
              placeholder={t('name_placeholder')}
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && formData.name.trim()) {
                  handleSubmit();
                }
              }}
              autoFocus
            />
          </div>
          <div className="space-y-3">
            <Label>{t('color')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {colorPresets.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    'h-8 w-8 rounded-md border-2 transition-all hover:scale-110',
                    formData.color === color
                      ? 'border-foreground ring-2 ring-foreground/20 ring-offset-2'
                      : 'border-border hover:border-foreground/50'
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData((prev) => ({ ...prev, color }))}
                  aria-label={t('select_color', { color })}
                >
                  {formData.color === color && (
                    <Check className="m-auto h-4 w-4 text-white" />
                  )}
                </button>
              ))}
              <div className="relative">
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      color: e.target.value,
                    }))
                  }
                  className="h-8 w-8 cursor-pointer rounded-md border-2 p-1"
                  title={t('custom_color')}
                />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="mb-2 text-muted-foreground text-xs">{t('preview')}</p>
              <Badge
                variant="outline"
                style={(() => {
                  const styles = computeAccessibleLabelStyles(
                    formData.color || '#EF4444',
                    !!isDark
                  );
                  return styles
                    ? {
                        backgroundColor: styles.bg,
                        borderColor: styles.border,
                        color: styles.text,
                      }
                    : undefined;
                })()}
                className="font-medium"
              >
                {formData.name || t('preview_text')}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.name.trim()}
              className="flex-1"
            >
              {isSubmitting
                ? label
                  ? t('updating')
                  : t('creating')
                : label
                  ? t('update_label')
                  : t('create_label')}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
