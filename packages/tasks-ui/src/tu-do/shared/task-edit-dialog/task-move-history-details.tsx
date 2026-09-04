import { ArrowRight } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';

interface TaskMoveHistoryValue {
  metadata: Record<string, unknown>;
  new_value: unknown;
  old_value: unknown;
}

function getListNameFromHistoryValue(value: unknown) {
  if (typeof value !== 'object' || value === null || !('name' in value)) {
    return null;
  }

  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name : null;
}

export function getTaskMoveListNames(entry: TaskMoveHistoryValue) {
  const oldListName =
    (typeof entry.metadata?.old_list_name === 'string'
      ? entry.metadata.old_list_name
      : null) ?? getListNameFromHistoryValue(entry.old_value);
  const newListName =
    (typeof entry.metadata?.new_list_name === 'string'
      ? entry.metadata.new_list_name
      : null) ?? getListNameFromHistoryValue(entry.new_value);

  return { oldListName, newListName };
}

export function TaskMoveHistoryDetails({
  destinationLabel,
  entry,
  sourceLabel,
  unknownListLabel,
}: {
  destinationLabel: string;
  entry: TaskMoveHistoryValue;
  sourceLabel: string;
  unknownListLabel: string;
}) {
  const { oldListName, newListName } = getTaskMoveListNames(entry);

  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
      <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
        {sourceLabel}
      </span>
      <Badge variant="outline" className="max-w-44 truncate text-xs">
        {oldListName ?? unknownListLabel}
      </Badge>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
        {destinationLabel}
      </span>
      <Badge variant="secondary" className="max-w-44 truncate text-xs">
        {newListName ?? unknownListLabel}
      </Badge>
    </span>
  );
}
