'use client';

import { CommandEmpty } from '@tuturuuu/ui/command';
import { Search } from '@tuturuuu/ui/icons';

export function EmptyState() {
  return (
    <CommandEmpty>
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-dynamic-blue/20 to-dynamic-purple/20 blur-lg" />
          <div className="relative rounded-full border border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/10 to-dynamic-purple/10 p-4">
            <Search className="h-6 w-6 text-dynamic-blue" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-foreground">No results found</p>
          <p className="max-w-sm text-muted-foreground text-sm">
            Try a different search term or explore the quick actions below
          </p>
        </div>
      </div>
    </CommandEmpty>
  );
}
