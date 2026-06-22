'use client';

import { ArrowLeft, ChevronDown, ChevronRight, Search } from '@tuturuuu/icons';
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
  DialogClose,
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
import { removeAccents } from '@tuturuuu/utils/text-helper';
import { useTranslations } from 'next-intl';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

export interface SettingsNavItem {
  name: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  disabled?: boolean;
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
   * Used when expandAllAccordions is false.
   * If not provided in that mode, only the first group expands.
   */
  primaryGroupLabels?: string[];
  /** Override to expand all accordions (user preference). Defaults to expanded. */
  expandAllAccordions?: boolean;
  /** Enable dialog-scoped keyboard shortcuts for search and tab navigation */
  keyboardNavigation?: boolean;
  /** Content to render in the main area */
  children: ReactNode;
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

/**
 * Shared settings dialog shell providing the layout framework.
 *
 * Each app provides its own `navItems` (ordered by priority) and
 * renders tab-specific content via `children`. The `primaryGroupLabels`
 * prop controls which groups expand when `expandAllAccordions` is false,
 * enabling apps to highlight their domain while preserving a compact mode.
 */
export function SettingsDialogShell({
  navItems,
  activeTab,
  onActiveTabChange,
  primaryGroupLabels,
  expandAllAccordions = true,
  keyboardNavigation = false,
  children,
}: SettingsDialogShellProps) {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const allNavItems = useMemo(
    () => navItems.flatMap((group) => group.items),
    [navItems]
  );

  const activeGroup = navItems.find((group) =>
    group.items.some((item) => item.name === activeTab)
  );

  const activeItem =
    allNavItems.find((item) => item.name === activeTab) ||
    allNavItems.find((item) => !item.disabled) ||
    allNavItems[0];

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

  const filteredEnabledItems = filteredNavItems.flatMap((group) =>
    group.items.filter((item) => !item.disabled)
  );

  const isGroupExpandedByDefault = (groupLabel: string, index: number) => {
    if (expandAllAccordions || searchQuery) return true;
    if (primaryGroupLabels) return primaryGroupLabels.includes(groupLabel);
    return index === 0;
  };

  const focusSearch = useCallback(() => {
    if (isMobile) {
      setMobileNavOpen(true);
      requestAnimationFrame(() => {
        mobileSearchInputRef.current?.focus();
      });
      return;
    }

    desktopSearchInputRef.current?.focus();
  }, [isMobile]);

  const changeActiveItem = useCallback(
    (targetIndex: number) => {
      const targetItem = filteredEnabledItems[targetIndex];
      if (targetItem) onActiveTabChange(targetItem.name);
    },
    [filteredEnabledItems, onActiveTabChange]
  );

  const moveActiveItem = useCallback(
    (direction: 1 | -1) => {
      if (filteredEnabledItems.length === 0) return;

      const currentIndex = filteredEnabledItems.findIndex(
        (item) => item.name === activeTab
      );
      const nextIndex =
        currentIndex === -1
          ? direction === 1
            ? 0
            : filteredEnabledItems.length - 1
          : (currentIndex + direction + filteredEnabledItems.length) %
            filteredEnabledItems.length;

      changeActiveItem(nextIndex);
    },
    [activeTab, changeActiveItem, filteredEnabledItems]
  );

  const handleKeyboardNavigation = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!keyboardNavigation || event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      const isModifierSearch =
        (event.metaKey || event.ctrlKey) && !event.altKey && key === 'f';
      const isSlashSearch =
        !event.metaKey && !event.ctrlKey && !event.altKey && event.key === '/';

      if (isModifierSearch || isSlashSearch) {
        if (isSlashSearch && isEditableShortcutTarget(event.target)) return;

        event.preventDefault();
        focusSearch();
        return;
      }

      if (
        !event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActiveItem(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActiveItem(-1);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        changeActiveItem(0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        changeActiveItem(filteredEnabledItems.length - 1);
      }
    },
    [
      changeActiveItem,
      filteredEnabledItems.length,
      focusSearch,
      keyboardNavigation,
      moveActiveItem,
    ]
  );

  return (
    <DialogContent
      presentation="fullscreen"
      className="flex-col"
      onKeyDown={handleKeyboardNavigation}
      showCloseButton={false}
    >
      <DialogTitle className="sr-only">{t('common.settings')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('common.settings')}
      </DialogDescription>
      <SidebarProvider className="flex h-full min-h-0 items-start">
        <Sidebar
          collapsible="none"
          className="hidden h-full w-72 flex-col border-r bg-muted/30 md:flex"
        >
          <SidebarHeader className="z-10 gap-3 p-4 pb-0">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 justify-start px-2 text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('settings.back_to_app')}
              </Button>
            </DialogClose>
            <div className="relative">
              <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
              <SidebarInput
                ref={desktopSearchInputRef}
                placeholder={t('settings.search_settings_placeholder')}
                className="bg-background pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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
                              disabled={item.disabled}
                              isActive={activeTab === item.name}
                              onClick={() => {
                                if (!item.disabled) {
                                  onActiveTabChange(item.name);
                                }
                              }}
                              className={cn(
                                'h-9 w-full justify-start px-2 transition-colors',
                                item.disabled &&
                                  'cursor-not-allowed opacity-50',
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
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">{t('settings.back_to_app')}</span>
              </Button>
            </DialogClose>
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
                      <CommandInput
                        ref={mobileSearchInputRef}
                        placeholder={t('settings.search_settings_placeholder')}
                      />
                      <CommandList className="max-h-[50vh]">
                        <CommandEmpty>
                          {t('common.no_results_found')}
                        </CommandEmpty>
                        {navItems.map((group) => (
                          <CommandGroup key={group.label} heading={group.label}>
                            {group.items.map((item) => (
                              <CommandItem
                                disabled={item.disabled}
                                key={item.name}
                                value={`${group.label} ${item.label} ${item.keywords?.join(' ') || ''}`}
                                onSelect={() => {
                                  if (item.disabled) return;
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
            <div className="mx-auto w-full max-w-4xl space-y-6">
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
