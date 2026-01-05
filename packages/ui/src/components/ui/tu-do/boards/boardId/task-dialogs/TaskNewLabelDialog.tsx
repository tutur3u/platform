'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
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
import { useTheme } from 'next-themes';
import { computeAccessibleLabelStyles } from '../../../utils/label-colors';

// Default translations for when component is rendered outside NextIntlClientProvider
const defaultTranslations = {
  create_new_label: 'Create New Label',
  create_new_label_description:
    'Create a new label to categorize and organize your tasks.',
  label_name: 'Label Name',
  color: 'Color',
  preview: 'Preview',
  cancel: 'Cancel',
  creating: 'Creating...',
  create_label: 'Create Label',
};

interface TaskNewLabelDialogProps {
  open: boolean;
  newLabelName: string;
  newLabelColor: string;
  creatingLabel: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onConfirm: () => void;
  /** Optional translations override for use in isolated React roots */
  translations?: {
    create_new_label?: string;
    create_new_label_description?: string;
    label_name?: string;
    color?: string;
    preview?: string;
    cancel?: string;
    creating?: string;
    create_label?: string;
  };
}

export function TaskNewLabelDialog({
  open,
  newLabelName,
  newLabelColor,
  creatingLabel,
  onOpenChange,
  onNameChange,
  onColorChange,
  onConfirm,
  translations,
}: TaskNewLabelDialogProps) {
  // Use provided translations or defaults
  const t = {
    create_new_label:
      translations?.create_new_label ?? defaultTranslations.create_new_label,
    create_new_label_description:
      translations?.create_new_label_description ??
      defaultTranslations.create_new_label_description,
    label_name: translations?.label_name ?? defaultTranslations.label_name,
    color: translations?.color ?? defaultTranslations.color,
    preview: translations?.preview ?? defaultTranslations.preview,
    cancel: translations?.cancel ?? defaultTranslations.cancel,
    creating: translations?.creating ?? defaultTranslations.creating,
    create_label:
      translations?.create_label ?? defaultTranslations.create_label,
  };

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.create_new_label}</DialogTitle>
          <DialogDescription>
            {t.create_new_label_description}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>{t.label_name}</Label>
            <Input
              value={newLabelName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Bug, Feature, Priority"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLabelName.trim()) {
                  onConfirm();
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t.color}</Label>
            <div className="flex items-center gap-3">
              <ColorPicker value={newLabelColor} onChange={onColorChange} />
              <Badge
                style={(() => {
                  const styles = computeAccessibleLabelStyles(
                    newLabelColor,
                    isDark
                  );
                  return styles
                    ? {
                        backgroundColor: styles.bg,
                        borderColor: styles.border,
                        color: styles.text,
                      }
                    : undefined;
                })()}
                className="border"
              >
                {newLabelName.trim() || t.preview}
              </Badge>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creatingLabel}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!newLabelName.trim() || creatingLabel}
          >
            {creatingLabel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.creating}
              </>
            ) : (
              t.create_label
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
