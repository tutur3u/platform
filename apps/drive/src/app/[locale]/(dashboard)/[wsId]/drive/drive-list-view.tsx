'use client';

import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { DriveItemIcon } from './drive-item-icon';
import { DriveItemMenu } from './drive-item-menu';
import {
  type DriveCollectionProps,
  isFolder,
  useDriveItemFormat,
} from './drive-view-helpers';
import { getStorageObjectDisplayName } from './storage-display-name';

export function DriveListView({
  actions,
  files,
  folders,
  isSelected,
  onNavigate,
  onSelectAll,
  onToggle,
}: DriveCollectionProps & { onSelectAll: (checked: boolean) => void }) {
  const t = useTranslations('drive');
  const format = useDriveItemFormat();
  const items = [...folders, ...files];
  const selectedCount = items.filter(isSelected).length;
  const allChecked =
    selectedCount === 0
      ? false
      : selectedCount === items.length
        ? true
        : 'indeterminate';

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevation-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                aria-label={t('selection.select_all')}
                checked={allChecked}
                onCheckedChange={(checked) => onSelectAll(checked === true)}
              />
            </TableHead>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead className="hidden lg:table-cell">
              {t('columns.type')}
            </TableHead>
            <TableHead className="hidden md:table-cell">
              {t('columns.modified')}
            </TableHead>
            <TableHead className="hidden sm:table-cell">
              {t('columns.size')}
            </TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t('columns.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const name = getStorageObjectDisplayName(item);
            const folder = isFolder(item);
            const selected = isSelected(item);
            const open = () =>
              folder ? onNavigate(item.name ?? '') : actions.onOpen(item);

            return (
              <TableRow
                key={item.id ?? item.name}
                data-state={selected ? 'selected' : undefined}
              >
                <TableCell>
                  <Checkbox
                    aria-label={t('selection.select_item', { name })}
                    checked={selected}
                    onCheckedChange={(checked) =>
                      onToggle(item, checked === true)
                    }
                  />
                </TableCell>
                <TableCell className="max-w-0">
                  <button
                    className="flex w-full min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={open}
                    type="button"
                  >
                    <DriveItemIcon
                      className="size-8 rounded-lg"
                      iconClassName="size-4"
                      item={item}
                    />
                    <span className="truncate font-semibold">{name}</span>
                  </button>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {format.kind(item)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {folder
                    ? '—'
                    : format.date(item.updated_at ?? item.created_at)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {folder ? '—' : format.size(item)}
                </TableCell>
                <TableCell>
                  <DriveItemMenu actions={actions} item={item} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
