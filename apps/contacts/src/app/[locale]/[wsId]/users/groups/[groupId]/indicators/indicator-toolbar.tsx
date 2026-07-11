import { FolderPlus, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

interface IndicatorToolbarProps {
  canCreate: boolean;
  onAddCategoryClick: () => void;
  onAddIndicatorClick: () => void;
}

export function IndicatorToolbar({
  canCreate,
  onAddCategoryClick,
  onAddIndicatorClick,
}: IndicatorToolbarProps) {
  const tIndicators = useTranslations('ws-user-group-indicators');

  if (!canCreate) return null;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" onClick={onAddCategoryClick}>
        <FolderPlus className="mr-2 h-4 w-4" />
        {tIndicators('add_metric_category')}
      </Button>
      <Button onClick={onAddIndicatorClick}>
        <Plus className="mr-2 h-4 w-4" />
        {tIndicators('add_indicator')}
      </Button>
    </div>
  );
}
