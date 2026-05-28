'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Check, ChevronsUpDown, Loader2 } from '@tuturuuu/icons';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

function workspaceSearchValue(workspace: InternalApiWorkspaceSummary) {
  const handle = (workspace as { handle?: string | null }).handle;

  return [workspace.id, workspace.name, handle].filter(Boolean).join(' ');
}

export function WorkspacePicker({
  defaultValue,
  id,
  name = 'workspaceId',
}: {
  defaultValue?: string | null;
  id: string;
  name?: string;
}) {
  const t = useTranslations('ai-agents-settings');
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultValue ?? '');
  const { data: workspaces, isLoading } = useQuery({
    queryFn: () => listWorkspaces(),
    queryKey: ['ai-agents', 'workspaces'],
    staleTime: 60_000,
  });
  const selectedWorkspace = useMemo(
    () => workspaces?.find((workspace) => workspace.id === selectedId) ?? null,
    [selectedId, workspaces]
  );
  const selectedLabel =
    selectedWorkspace?.name || selectedId || t('workspace.select');

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('fields.workspace_id')}</Label>
      <Input id={id} name={name} readOnly type="hidden" value={selectedId} />
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="h-10 w-full justify-between"
            role="combobox"
            type="button"
            variant="outline"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{selectedLabel}</span>
            </span>
            {isLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(34rem,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder={t('workspace.search_placeholder')} />
            <CommandList>
              <CommandEmpty>{t('workspace.empty')}</CommandEmpty>
              <CommandGroup>
                {(workspaces ?? []).map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    onSelect={() => {
                      setSelectedId(workspace.id);
                      setOpen(false);
                    }}
                    value={workspaceSearchValue(workspace)}
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {workspace.name || workspace.id}
                      </span>
                      <span className="block truncate font-mono text-muted-foreground text-xs">
                        {workspace.id}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        selectedId === workspace.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
