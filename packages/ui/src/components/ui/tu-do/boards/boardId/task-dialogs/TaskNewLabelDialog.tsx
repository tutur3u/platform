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
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { computeAccessibleLabelStyles } from '../../../utils/label-colors';

interface TaskNewLabelDialogProps {
  open: boolean;
  newLabelName: string;
  newLabelColor: string;
  creatingLabel: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onConfirm: () => void;
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
}: TaskNewLabelDialogProps) {
  const t = useTranslations('common');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('create_new_label')}</DialogTitle>
          <DialogDescription>
            {t('create_new_label_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>{t('label_name')}</Label>
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
            <Label>{t('color')}</Label>
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
                {newLabelName.trim() || t('preview')}
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
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!newLabelName.trim() || creatingLabel}
          >
            {creatingLabel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('creating')}
              </>
            ) : (
              t('create_label')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
