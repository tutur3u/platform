'use client';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@tuturuuu/ui/sidebar';
import { cn } from '@tuturuuu/utils/format';
import type { SettingsNavGroup } from './satellite-settings-dialog-shell';

interface SettingsSidebarGroupProps {
  activeTab: string;
  group: SettingsNavGroup;
  onSelect: (tab: string) => void;
}

export function SettingsSidebarGroup({
  activeTab,
  group,
  onSelect,
}: SettingsSidebarGroupProps) {
  const labelRepeatsOnlyItem =
    group.items.length === 1 && group.items[0]?.label === group.label;

  return (
    <SidebarGroup className="p-0">
      {!labelRepeatsOnlyItem && (
        <SidebarGroupLabel className="h-7 px-2 font-medium text-muted-foreground text-xs">
          {group.label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {group.items.map((item) => (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton
                disabled={item.disabled}
                isActive={activeTab === item.name}
                aria-current={activeTab === item.name ? 'page' : undefined}
                onClick={() => {
                  if (!item.disabled) {
                    onSelect(item.name);
                  }
                }}
                className={cn(
                  'h-9 w-full justify-start gap-2.5 rounded-lg px-2 transition-colors',
                  item.disabled &&
                    'cursor-not-allowed opacity-70 disabled:opacity-70',
                  activeTab === item.name
                    ? 'bg-accent font-semibold text-accent-foreground ring-1 ring-border hover:bg-accent hover:text-accent-foreground'
                    : 'text-foreground/80 hover:bg-transparent hover:text-foreground/80 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
