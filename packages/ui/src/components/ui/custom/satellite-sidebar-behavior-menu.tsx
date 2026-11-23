'use client';

import {
  Check,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  SquareMousePointer,
} from '@tuturuuu/icons';
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { SidebarBehavior } from './sidebar-behavior';

type SidebarLabelKey =
  | 'common.collapsed'
  | 'common.expand_on_hover'
  | 'common.expanded'
  | 'common.minimal'
  | 'common.sidebar';

const OPTIONS = [
  { value: 'expanded', label: 'common.expanded', Icon: PanelLeftOpen },
  { value: 'collapsed', label: 'common.collapsed', Icon: PanelLeftClose },
  { value: 'hover', label: 'common.expand_on_hover', Icon: SquareMousePointer },
  { value: 'minimal', label: 'common.minimal', Icon: PanelLeft },
] as const satisfies readonly {
  value: SidebarBehavior;
  label: SidebarLabelKey;
  Icon: typeof PanelLeft;
}[];

/** The account menu's Sidebar submenu: expanded, collapsed, hover, minimal. */
export function SatelliteSidebarBehaviorMenu({
  sidebar,
  t,
}: {
  sidebar: {
    behavior: SidebarBehavior;
    handleBehaviorChange: (value: SidebarBehavior) => void;
  };
  t: (key: SidebarLabelKey) => string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="hidden md:flex">
        <PanelLeft className="h-4 w-4 text-dynamic-purple" />
        <span>{t('common.sidebar')}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent sideOffset={4}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => sidebar.handleBehaviorChange(value)}
              disabled={sidebar.behavior === value}
            >
              <Icon className="h-4 w-4 text-dynamic-purple" />
              <span>{t(label)}</span>
              {sidebar.behavior === value && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
