'use client';
import { Button } from '@tuturuuu/ui/button';
import {
  Calendar as CalendarIcon,
  Mail,
  Plus,
} from '@tuturuuu/ui/icons';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@tuturuuu/ui/sidebar';
import { cn } from '@tuturuuu/utils/format';

// Stub: Replace with real data fetching later
const stubAccounts = [
  { email: 'user@gmail.com', provider: 'google', active: true },
  // Add more accounts as needed
];

export default function CalendarSidebar() {
  return (
    <aside className="slide-in-from-left-5 mr-2 flex h-full w-[261px] flex-col rounded-lg border border-border bg-background/60 text-foreground shadow-xl backdrop-blur-md transition-all duration-500 ease-out xl:flex">
      {/* Header */}
      <SidebarHeader className="flex items-center justify-between border-border/50 border-b bg-gradient-to-r from-background/80 to-background/60 px-4 py-3">
        <span className="flex items-center gap-2 font-semibold text-lg">
          <CalendarIcon className="h-5 w-5" />
          Calendar
        </span>
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-y-auto p-4">
        {/* Accounts Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Accounts</SidebarGroupLabel>
          <SidebarMenu>
            {stubAccounts.length === 0 ? (
              <SidebarMenuItem>
                <Button
                  className="flex w-full items-center gap-2"
                  disabled
                  variant="outline"
                >
                  <Plus className="h-4 w-4" /> Add account
                </Button>
              </SidebarMenuItem>
            ) : (
              stubAccounts.map((acc) => (
                <SidebarMenuItem key={acc.email}>
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-md p-2',
                      acc.active && 'bg-accent/30 font-semibold'
                    )}
                  >
                    <Mail className="h-4 w-4 text-blue-500" />
                    <span className="truncate">{acc.email}</span>
                    {acc.active && (
                      <span className="ml-2 text-green-600 text-xs">
                        Active
                      </span>
                    )}
                  </div>
                </SidebarMenuItem>
              ))
            )}
            <SidebarMenuItem>
              <Button
                className="flex w-full items-center gap-2"
                disabled
                variant="ghost"
              >
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
              <span className="text-muted-foreground">
                No calendars connected
              </span>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Button
                className="flex w-full items-center gap-2"
                disabled
                variant="ghost"
              >
                <Plus className="h-4 w-4" /> Add calendar
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </aside>
  );
}
