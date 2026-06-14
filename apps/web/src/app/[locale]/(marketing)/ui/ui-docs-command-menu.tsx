'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { SidebarGroup, SidebarLabels } from './ui-docs-nav-data';
import { getAccent } from './ui-docs-theme';

export function UiDocsCommandMenu({
  open,
  onOpenChange,
  groups,
  labels,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: SidebarGroup[];
  labels: SidebarLabels;
  locale: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  function navigate(slug: string) {
    onOpenChange(false);
    router.push(`/${locale}/ui/components/${slug}`);
  }

  return (
    <CommandDialog
      description={labels.commandHint}
      onOpenChange={onOpenChange}
      open={open}
      title={labels.commandTrigger}
    >
      <CommandInput placeholder={labels.commandPlaceholder} />
      <CommandList>
        <CommandEmpty>{labels.commandEmpty}</CommandEmpty>
        {groups.map((group) => {
          const accent = getAccent(group.category);
          return (
            <CommandGroup heading={group.label} key={group.category}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.slug}
                  onSelect={() => navigate(item.slug)}
                  value={`${item.name} ${item.slug}`}
                >
                  <span className={cn('size-1.5 rounded-full', accent.dot)} />
                  {item.name}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
