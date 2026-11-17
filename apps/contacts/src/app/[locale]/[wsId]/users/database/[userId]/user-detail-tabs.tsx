'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { UserDetailTab } from './types';

export function UserDetailTabs({ tabs }: { tabs: UserDetailTab[] }) {
  const defaultValue = tabs[0]?.value;

  if (!defaultValue) return null;

  return (
    <Tabs defaultValue={defaultValue} className="gap-4">
      <div className="overflow-x-auto">
        <TabsList className="h-auto w-max min-w-full justify-start gap-1 bg-muted/40 ring-1 ring-dynamic-border [--radius-segment:0.75rem] sm:min-w-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="min-h-9 px-3"
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <Badge variant="secondary" className="ml-1">
                  {tab.count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
