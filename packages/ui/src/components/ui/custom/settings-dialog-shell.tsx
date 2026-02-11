'use client';

import { ChevronDown, ChevronRight, Search } from '@tuturuuu/icons';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@tuturuuu/ui/drawer';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@tuturuuu/ui/sidebar';
import { cn } from '@tuturuuu/utils/format';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { removeAccents } from '@tuturuuu/utils/text-helper';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';

export interface SettingsNavItem {
  name: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  keywords?: string[];
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export interface SettingsDialogShellProps {
  /** Ordered list of navigation groups */
  navItems: SettingsNavGroup[];
  /** Currently active tab name */
  activeTab: string;
  /** Callback when active tab changes */
  onActiveTabChange: (tab: string) => void;
  /**
   * Group labels that should be expanded by default.
   * All other groups will be collapsed.
   * If not provided, only the first group expands by default.
   */
  primaryGroupLabels?: string[];
  /** Override to expand all accordions (user preference) */
  expandAllAccordions?: boolean;
  /** Content to render in the main area */
  children: ReactNode;
}

/**
 * Shared settings dialog shell providing the layout framework.
 *
 * Each app provides its own `navItems` (ordered by priority) and
 * renders tab-specific content via `children`. The `primaryGroupLabels`
 * prop controls which groups expand by default — enabling apps to
 * highlight their domain (e.g., tasks-first in tudo, calendar-first
 * in a future calendar app).
 */
export function SettingsDialogShell({
  navItems,
  activeTab,
  onActiveTabChange,
  primaryGroupLabels,
  expandAllAccordions = false,
  children,
}: SettingsDialogShellProps) {
  const t = useTranslations();
  const { isMac, modKey } = usePlatform();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeGroup = navItems.find((g) =>
    g.items.some((i) => i.name === activeTab)
  );

  const activeItem =
    navItems.flatMap((g) => g.items).find((i) => i.name === activeTab) ||
    navItems[0]?.items[0];

  const filteredNavItems = navItems
    .map((group) => {
      const normalizedQuery = removeAccents(searchQuery.toLowerCase());
      const filteredItems = group.items.filter(
        (item) =>
          removeAccents(item.label.toLowerCase()).includes(normalizedQuery) ||
          (item.description &&
            removeAccents(item.description.toLowerCase()).includes(
              normalizedQuery
            )) ||
          item.keywords?.some((keyword) =>
            removeAccents(keyword.toLowerCase()).includes(normalizedQuery)
          )
      );
      return { ...group, items: filteredItems };
    })
    .filter((group) => group.items.length > 0);

  const isGroupExpandedByDefault = (groupLabel: string, index: number) => {
    if (expandAllAccordions || !!searchQuery) return true;
    if (primaryGroupLabels) return primaryGroupLabels.includes(groupLabel);
    return index === 0;
  };

  return (
    <DialogContent className="flex h-[90vh] flex-col overflow-hidden p-0 md:max-h-200 md:max-w-225 lg:max-h-250 lg:max-w-250 xl:max-w-300">
      <DialogTitle className="sr-only">{t('common.settings')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('common.settings')}
      </DialogDescription>
      <SidebarProvider className="flex h-full min-h-0 items-start">
        <Sidebar
          collapsible="none"
          className="hidden h-full w-64 flex-col border-r bg-muted/30 md:flex"
        >
          <SidebarHeader className="z-10 p-4 pb-0">
            <div className="relative mb-2">
              <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
              <SidebarInput
                placeholder={t('search.search')}
                className="bg-background pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Detected OS: {isMac ? 'macOS' : 'Windows/Linux'} ({modKey})
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent className="overflow-y-auto p-4">
            {filteredNavItems.map((group, index) => (
              <Collapsible
                key={`${group.label}-${searchQuery ? 'search' : 'browse'}-${expandAllAccordions ? 'expanded' : 'collapsed'}`}
                defaultOpen={isGroupExpandedByDefault(group.label, index)}
                open={expandAllAccordions ? true : undefined}
                className="group/collapsible"
              >
                <SidebarGroup className="p-0">
                  <SidebarGroupLabel
                    asChild
                    className="group/label w-full cursor-pointer text-sidebar-foreground text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <CollapsibleTrigger>
                      {group.label}
                      <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.name}>
                            <SidebarMenuButton
                              isActive={activeTab === item.name}
                              onClick={() => onActiveTabChange(item.name)}
                              className={cn(
                                'h-9 w-full justify-start px-2 transition-colors',
                                activeTab === item.name
                                  ? 'bg-accent font-medium text-accent-foreground'
                                  : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                              )}
                            >
                              <item.icon className="mr-2 h-4 w-4" />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            ))}
          </SidebarContent>
        </Sidebar>
        <main className="flex h-full flex-1 flex-col overflow-hidden bg-background">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 pr-12 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6 md:pr-6">
            <div className="flex flex-1 items-center gap-2 md:flex-initial">
              {isMobile && (
                <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                  <DrawerTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={mobileNavOpen}
                      className="w-full flex-1 justify-between gap-2"
                    >
                      {activeItem && (
                        <>
                          <activeItem.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate text-left">
                            {activeItem.label}
                          </span>
                        </>
                      )}
                      <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader className="sr-only">
                      <DrawerTitle>{t('common.settings')}</DrawerTitle>
                      <DrawerDescription>
                        {t('search.search')}
                      </DrawerDescription>
                    </DrawerHeader>
                    <Command className="rounded-none border-0">
                      <CommandInput placeholder={t('search.search')} />
                      <CommandList className="max-h-[50vh]">
                        <CommandEmpty>
                          {t('common.no_results_found')}
                        </CommandEmpty>
                        {navItems.map((group) => (
                          <CommandGroup key={group.label} heading={group.label}>
                            {group.items.map((item) => (
                              <CommandItem
                                key={item.name}
                                value={`${group.label} ${item.label} ${item.keywords?.join(' ') || ''}`}
                                onSelect={() => {
                                  onActiveTabChange(item.name);
                                  setMobileNavOpen(false);
                                }}
                                className={cn(
                                  'flex items-center gap-2',
                                  activeTab === item.name && 'bg-accent'
                                )}
                              >
                                <item.icon className="h-4 w-4" />
                                <div className="flex flex-col">
                                  <span>{item.label}</span>
                                  {item.description && (
                                    <span className="line-clamp-1 text-muted-foreground text-xs">
                                      {item.description}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </DrawerContent>
                </Drawer>
              )}

              <Breadcrumb className="hidden md:flex">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#" className="pointer-events-none">
                      {t('common.settings')}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  {activeGroup && (
                    <>
                      <BreadcrumbItem>
                        <BreadcrumbPage className="text-muted-foreground">
                          {activeGroup.label}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                    </>
                  )}
                  <BreadcrumbItem>
                    <BreadcrumbPage>{activeItem?.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="space-y-1">
                <h2 className="font-semibold text-lg tracking-tight">
                  {activeItem?.label}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {activeItem?.description ||
                    t('settings.manage_settings', {
                      label: activeItem?.label?.toLowerCase() ?? '',
                    })}
                </p>
              </div>
              <Separator />
              {children}
            </div>
          </div>
        </main>
      </SidebarProvider>
    </DialogContent>
  );
}
