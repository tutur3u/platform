import {
  Archive,
  ArrowRightLeft,
  CheckSquare,
  MoreHorizontal,
  Settings2,
  Trash,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Kbd } from '@tuturuuu/ui/kbd';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent, ReactNode } from 'react';
import { useState } from 'react';

/**
 * Single-letter shortcuts that work only while the list menu is open. They
 * never reach the page, so they cannot collide with browser or OS shortcuts
 * (Cmd+A, Cmd+Backspace) or the board's own Shift/modifier shortcuts.
 */
export const LIST_MENU_SHORTCUTS = {
  settings: 'E',
  selectAll: 'S',
  moveAll: 'M',
  archiveAll: 'A',
  delete: 'D',
} as const;

type ShortcutAction = keyof typeof LIST_MENU_SHORTCUTS;

interface Props {
  taskCount: number;
  onOpenSettings?: () => void;
  onSelectAll?: () => void;
  onMoveAll?: () => void;
  onArchiveAll?: () => void;
  onDelete?: () => void;
}

function CountChip({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-muted px-1.5 text-muted-foreground text-xs tabular-nums">
      {count}
    </span>
  );
}

function ItemTrail({ count, keyLabel }: { count?: number; keyLabel: string }) {
  return (
    <DropdownMenuShortcut className="flex items-center gap-1.5 tracking-normal">
      {typeof count === 'number' ? <CountChip count={count} /> : null}
      <Kbd aria-hidden>{keyLabel}</Kbd>
    </DropdownMenuShortcut>
  );
}

export function ListActionsMenu({
  taskCount,
  onOpenSettings,
  onSelectAll,
  onMoveAll,
  onArchiveAll,
  onDelete,
}: Props) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);

  const actions: Partial<Record<ShortcutAction, () => void>> = {
    settings: onOpenSettings,
    selectAll: onSelectAll,
    moveAll: onMoveAll,
    archiveAll: onArchiveAll,
    delete: onDelete,
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toUpperCase();
    const match = (
      Object.entries(LIST_MENU_SHORTCUTS) as [ShortcutAction, string][]
    ).find(([, letter]) => letter === key);
    const action = match ? actions[match[0]] : undefined;
    if (!action) return;
    event.preventDefault();
    setOpen(false);
    action();
  };

  const item = (
    action: ShortcutAction,
    icon: ReactNode,
    label: string,
    count?: number,
    variant?: 'destructive'
  ) => {
    const run = actions[action];
    if (!run) return null;
    return (
      <DropdownMenuItem
        aria-keyshortcuts={LIST_MENU_SHORTCUTS[action]}
        onSelect={() => {
          setOpen(false);
          run();
        }}
        variant={variant}
      >
        {icon}
        {label}
        <ItemTrail count={count} keyLabel={LIST_MENU_SHORTCUTS[action]} />
      </DropdownMenuItem>
    );
  };

  const hasTaskActions = Boolean(onSelectAll || onMoveAll || onArchiveAll);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground">
          <span className="sr-only">{t('open_menu')}</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onKeyDown={handleKeyDown}
      >
        {item('settings', <Settings2 />, t('list_settings'))}
        {onOpenSettings && hasTaskActions ? <DropdownMenuSeparator /> : null}
        {item('selectAll', <CheckSquare />, t('select_all_tasks'), taskCount)}
        {item('moveAll', <ArrowRightLeft />, t('move_all_tasks'), taskCount)}
        {item('archiveAll', <Archive />, t('archive_all_tasks'), taskCount)}
        {onDelete && (onOpenSettings || hasTaskActions) ? (
          <DropdownMenuSeparator />
        ) : null}
        {item('delete', <Trash />, t('delete_list'), undefined, 'destructive')}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
