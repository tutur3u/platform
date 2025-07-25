'use client';
import { Button } from '@tuturuuu/ui/button';
import {
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem
} from '@tuturuuu/ui/sidebar';
import { Calendar as CalendarIcon, Mail, PanelRightClose, Plus } from '@tuturuuu/ui/icons';

// Stub: Replace with real data fetching later
const stubAccounts = [
  { email: 'user@gmail.com', provider: 'google', active: true },
  // Add more accounts as needed
];

export default function CalendarSidebar({ onClose }: { onClose: () => void }) {
  return (
    <aside className="mr-2 flex h-full w-64 flex-col rounded-lg border border-border bg-background/60 text-foreground shadow-xl backdrop-blur-md transition-all duration-500 ease-out slide-in-from-left-5 xl:flex">
      {/* Header */}
      <SidebarHeader className="flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-background/80 to-background/60 px-4 py-3">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <CalendarIcon className="h-5 w-5" />
          Calendar
        </span>
        <Button
          aria-label="Collapse sidebar"
          className="group relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-105 hover:bg-accent/60"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <PanelRightClose className="h-5 w-5 text-foreground transition-transform duration-200 group-hover:-rotate-12" />
        </Button>
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-y-auto p-4">
        {/* Accounts Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Accounts</SidebarGroupLabel>
          <SidebarMenu>
            {stubAccounts.length === 0 ? (
              <SidebarMenuItem>
                <Button className="flex w-full items-center gap-2" disabled variant="outline">
                  <Plus className="h-4 w-4" /> Add account
                </Button>
              </SidebarMenuItem>
            ) : (
              stubAccounts.map((acc) => (
                <SidebarMenuItem key={acc.email}>
                  <div className={`flex items-center gap-2 rounded-md p-2${acc.active ? ' bg-accent/30 font-semibold' : ''}`}>
                    <Mail className="h-4 w-4 text-blue-500" />
                    <span className="truncate">{acc.email}</span>
                    {acc.active && <span className="ml-2 text-xs text-green-600">Active</span>}
                  </div>
                </SidebarMenuItem>
              ))
            )}
            <SidebarMenuItem>
              <Button className="flex w-full items-center gap-2" disabled variant="ghost">
                <Plus className="h-4 w-4" /> Add account
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {/* Calendars Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Calendars</SidebarGroupLabel>
          <SidebarMenu>
            {/* Placeholder: No calendars yet */}
            <SidebarMenuItem>
              <span className="text-muted-foreground">No calendars connected</span>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Button className="flex w-full items-center gap-2" disabled variant="ghost">
                <Plus className="h-4 w-4" /> Add calendar
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </aside>
  );
} 