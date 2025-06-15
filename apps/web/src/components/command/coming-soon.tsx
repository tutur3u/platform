'use client';

import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { Search, Zap } from 'lucide-react';

export function ComingSoonSection() {
  return (
    <CommandGroup heading="🔮 Coming Soon">
      <CommandItem className="group cursor-pointer opacity-60" disabled>
        <div className="flex w-full items-center gap-4">
          <div className="rounded-lg border border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/10 to-dynamic-purple/10 p-2.5">
            <Search className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div className="flex flex-1 flex-col">
            <span className="font-semibold text-foreground">
              Search tasks and content
            </span>
            <span className="text-xs text-muted-foreground">
              Find anything across your workspace
            </span>
          </div>
          <div className="rounded-full bg-dynamic-blue/5 px-2 py-1 text-xs text-dynamic-blue/40">
            Soon
          </div>
        </div>
      </CommandItem>
      <CommandItem className="group cursor-pointer opacity-60" disabled>
        <div className="flex w-full items-center gap-4">
          <div className="rounded-lg border border-dynamic-purple/20 bg-gradient-to-br from-dynamic-purple/10 to-dynamic-pink/10 p-2.5">
            <Zap className="h-5 w-5 text-dynamic-purple" />
          </div>
          <div className="flex flex-1 flex-col">
            <span className="font-semibold text-foreground">
              AI-powered shortcuts
            </span>
            <span className="text-xs text-muted-foreground">
              Smart suggestions and automation
            </span>
          </div>
          <div className="rounded-full bg-dynamic-purple/5 px-2 py-1 text-xs text-dynamic-purple/40">
            Soon
          </div>
        </div>
      </CommandItem>
    </CommandGroup>
  );
}
