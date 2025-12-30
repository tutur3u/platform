import { Edit2, MoreVertical, Palette, Trash2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
    <Card
      className="group relative cursor-pointer overflow-hidden transition-all hover:scale-[1.02] hover:shadow-md"
      onClick={() => onEdit(label)}
    >
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            style={badgeStyle}
            className="font-semibold text-sm"
          >
            {label.name}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
                <span className="sr-only">{t('open_menu')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(label);
                }}
              >
                <Edit2 className="mr-2 h-4 w-4" />
                {t('edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(label);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Palette className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono">
            {label.color.toUpperCase()}
          </span>
        </div>
      </div>
      <div
        className="absolute bottom-0 left-0 h-1 w-full transition-all group-hover:h-1.5"
        style={{ backgroundColor: label.color }}
      />
    </Card>
  );
}
