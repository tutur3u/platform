import { Repeat } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { ContextMenuContent, ContextMenuItem } from '../../context-menu';

export function NativeRecurrenceContextMenu({
  onEdit,
  readOnly,
}: {
  onEdit: () => void;
  readOnly: boolean;
}) {
  const t = useTranslations('calendar.recurrence');
  return (
    <ContextMenuContent>
      <ContextMenuItem disabled={readOnly} onSelect={onEdit}>
        <Repeat className="size-4" />
        {t('edit')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
