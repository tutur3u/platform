'use client';

import { Server } from '@tuturuuu/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@tuturuuu/ui/select';
import type { HiveServer } from '../../../engine/types';

type HiveServerSelectProps = {
  activeServerId: string | null;
  labels: {
    empty: string;
    enabled: string;
    paused: string;
    select: string;
  };
  onSelectServer: (id: string) => void;
  server?: HiveServer | null;
  servers: HiveServer[];
};

export function HiveServerSelect({
  activeServerId,
  labels,
  onSelectServer,
  server,
  servers,
}: HiveServerSelectProps) {
  return (
    <Select
      disabled={servers.length === 0}
      onValueChange={onSelectServer}
      value={activeServerId ?? undefined}
    >
      <SelectTrigger
        aria-label={labels.select}
        className="h-9 w-[9.75rem] justify-start rounded-md border-0 bg-transparent px-1.5 shadow-none transition-[background-color,transform,width] duration-200 ease-out hover:bg-muted/50 focus-visible:ring-0 sm:w-[12.5rem]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-dynamic-green/20 shadow-inner transition-[background-color,border-color,color,transform] duration-200 ease-out">
            <Server className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 truncate text-left font-medium text-sm leading-none">
            {server?.name ?? labels.empty}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent align="end" className="min-w-56">
        {servers.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            <span className="min-w-0">
              <span className="block truncate">{item.name}</span>
              <span className="block truncate text-muted-foreground text-xs">
                {item.slug} / {item.enabled ? labels.enabled : labels.paused}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
