'use client';

import { Button } from '@tuturuuu/ui/button';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { ChevronDown, ChevronRight, Search, Zap } from '@tuturuuu/ui/icons';
import { useState } from 'react';

export function ComingSoonSection() {
  const [isExpanded, setIsExpanded] = useState(false); // Default to collapsed for coming soon

  return (
    <div className="border-b border-border/50 pb-2">
      {/* Collapsible Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            🔮 Coming Soon
          </span>
          <div className="rounded-md bg-dynamic-purple/10 px-2 py-0.5 text-xs font-medium text-dynamic-purple">
            2 features
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 w-6 p-0 hover:bg-muted/50"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <CommandGroup>
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
      )}
    </div>
  );
}
