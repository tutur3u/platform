import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';

export interface DriveExplorerItemsProps {
  wsId: string;
  items: StorageObject[];
  path: string;
  allSelected?: boolean;
  onNavigate: (name: string) => void;
  onPreview: (item: StorageObject | undefined) => void;
  onRequestRename: (item: StorageObject) => void;
  onRequestDelete: (item: StorageObject) => void;
  onSelectAll?: (checked: boolean) => void;
  onToggleSelection?: (item: StorageObject, checked: boolean) => void;
  onMutationSuccess: () => void | Promise<void>;
  selectedKeys?: string[];
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function isFolder(item: StorageObject) {
  return !item.id;
}
