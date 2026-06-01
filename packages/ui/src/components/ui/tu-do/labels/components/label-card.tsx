import { Edit2, Palette, Trash2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { computeAccessibleLabelStyles } from '@tuturuuu/ui/tu-do/utils/label-colors';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { TaskLabel } from '../types';

interface LabelCardProps {
  label: TaskLabel;
  onEdit: (label: TaskLabel) => void;
  onDelete: (label: TaskLabel) => void;
}

export function LabelCard({ label, onEdit, onDelete }: LabelCardProps) {
  const t = useTranslations('ws-tasks-labels');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const styles = computeAccessibleLabelStyles(label.color, !!isDark);
  const badgeStyle = styles
    ? {
        backgroundColor: styles.bg,
        borderColor: styles.border,
        color: styles.text,
      }
    : undefined;

  return (
    <Card className="group relative overflow-hidden transition-colors hover:border-foreground/30">
      <button
        type="button"
        className="w-full p-4 text-left"
        onClick={() => onEdit(label)}
      >
        <div
          className="mb-4 h-10 rounded-md border"
          style={{
            backgroundColor: label.color,
            borderColor: label.color,
          }}
        />
        <div className="mb-5 flex min-h-8 items-start justify-between gap-3">
          <Badge
            variant="outline"
            style={badgeStyle}
            className="max-w-full truncate font-semibold text-sm"
          >
            {label.name}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Palette className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono">
            {label.color.toUpperCase()}
          </span>
        </div>
      </button>
      <div className="absolute right-3 bottom-3 flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-background/80"
          onClick={() => onEdit(label)}
        >
          <Edit2 className="h-3.5 w-3.5" />
          <span className="sr-only">{t('edit')}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-background/80 text-destructive hover:text-destructive"
          onClick={() => onDelete(label)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">{t('delete')}</span>
        </Button>
      </div>
      <div
        className="absolute bottom-0 left-0 h-1 w-full"
        style={{ backgroundColor: label.color }}
      />
    </Card>
  );
}
