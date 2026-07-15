'use client';

import { Check, Palette, Shuffle } from '@tuturuuu/icons';
import {
  computeAccessibleLabelStyles,
  getRandomLabelColor,
} from '@tuturuuu/tasks-ui/tu-do/utils/label-colors';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { colorPresets, type TaskLabel } from '../types';

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
    color: getRandomLabelColor(),
  });

  useEffect(() => {
    if (!open) return;

    if (label) {
      setFormData({
        name: label.name,
        color: label.color,
      });
    } else {
      setFormData((prev) => ({
        name: '',
        color: getRandomLabelColor(prev.color),
      }));
    }
  }, [label, open]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    await onSubmit(formData);
  };

  const handleRandomColor = () => {
    setFormData((prev) => ({
      ...prev,
      color: getRandomLabelColor(prev.color),
    }));
  };

  const previewStyles = computeAccessibleLabelStyles(
    formData.color || '#EF4444',
    !!isDark
  );
  const colorInputValue = /^#[0-9a-fA-F]{6}$/.test(formData.color)
    ? formData.color
    : '#000000';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[37.5rem]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="rounded-md border p-3"
              style={{
                backgroundColor: formData.color,
                borderColor: formData.color,
              }}
            >
              <Palette
                className="h-5 w-5"
                style={{ color: getReadableSwatchForeground(formData.color) }}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>
                {label ? t('edit_label') : t('create_label')}
              </DialogTitle>
              <DialogDescription>
                {label ? t('edit_description') : t('create_description')}
              </DialogDescription>
            </div>
          </div>
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
            <div className="flex items-center justify-between gap-3">
              <Label>{t('color')}</Label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleRandomColor}
                title={t('randomize_color')}
              >
                <Shuffle className="h-4 w-4" />
                <span className="sr-only">{t('randomize_color')}</span>
              </Button>
            </div>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {colorPresets.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    'h-10 rounded-md border-2 transition-transform hover:scale-105',
                    formData.color === color
                      ? 'border-foreground ring-2 ring-foreground/20 ring-offset-2'
                      : 'border-border hover:border-foreground/50'
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData((prev) => ({ ...prev, color }))}
                  aria-label={t('select_color', { color })}
                >
                  {formData.color === color && (
                    <Check
                      className="m-auto h-4 w-4"
                      style={{ color: getReadableSwatchForeground(color) }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="custom-label-color">{t('custom_hex')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="custom-label-color"
                    value={formData.color}
                    maxLength={7}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                  />
                  <Input
                    type="color"
                    value={colorInputValue}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="h-10 w-12 cursor-pointer rounded-md border p-1"
                    title={t('custom_color')}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">{t('preview')}</p>
                <Badge
                  variant="outline"
                  style={
                    previewStyles
                      ? {
                          backgroundColor: previewStyles.bg,
                          borderColor: previewStyles.border,
                          color: previewStyles.text,
                        }
                      : undefined
                  }
                  className="max-w-full truncate font-medium"
                >
                  {formData.name || t('preview_text')}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.name.trim()}
            >
              {isSubmitting
                ? label
                  ? t('updating')
                  : t('creating')
                : label
                  ? t('update_label')
                  : t('create_label')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getReadableSwatchForeground(color: string) {
  const normalized = color.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return undefined;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.58 ? '#111827' : '#FFFFFF';
}
