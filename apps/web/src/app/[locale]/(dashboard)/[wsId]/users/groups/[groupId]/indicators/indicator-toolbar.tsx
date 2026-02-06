import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

interface IndicatorToolbarProps {
  canCreate: boolean;
  onAddClick: () => void;
}

export function IndicatorToolbar({
  canCreate,
  onAddClick,
}: IndicatorToolbarProps) {
  const tIndicators = useTranslations('ws-user-group-indicators');

  if (!canCreate) return null;

  return (
    <div className="flex justify-end">
      <Button onClick={onAddClick}>
        <Plus className="mr-2 h-4 w-4" />
        {tIndicators('add_indicator')}
      </Button>
    </div>
  );
}
