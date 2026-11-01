import { LayoutGrid, Settings2 } from '@tuturuuu/icons';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { ReactNode } from 'react';

interface BoardSettingsNavigationProps {
  boardDetailsLabel: string;
  boardLayoutLabel: string;
  children: ReactNode;
  listCount: number;
}

export function BoardSettingsNavigation({
  boardDetailsLabel,
  boardLayoutLabel,
  children,
  listCount,
}: BoardSettingsNavigationProps) {
  return (
    <Tabs className="space-y-4" defaultValue="setup">
      <TabsList>
        <TabsTrigger className="gap-2" value="setup">
          <Settings2 className="size-4" />
          {boardDetailsLabel}
        </TabsTrigger>
        <TabsTrigger className="gap-2" value="layout">
          <LayoutGrid className="size-4" />
          {boardLayoutLabel}
          <span className="text-muted-foreground text-xs tabular-nums">
            {listCount}
          </span>
        </TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}
