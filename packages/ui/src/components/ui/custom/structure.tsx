'use client';

import { ChevronLeft, ChevronRight, Menu, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { observeMobileHeaderHeight } from './mobile-header-height';
import { SidebarMinimalTrigger } from './sidebar-minimal-trigger';
import { SidebarOverlayContext } from './sidebar-overlay-context';
import { useSidebarOverlayClose } from './use-sidebar-overlay-close';
import { useSidebarRailUnderlay } from './use-sidebar-rail-underlay';

/** Hover intent for minimal mode: a pointer passing the edge opens nothing. */
const MINIMAL_OPEN_DELAY_MS = 120;
/** Grace for a pointer that slips off the floating panel and comes back. */
const MINIMAL_CLOSE_DELAY_MS = 240;

/**
 * Minimal mode geometry. The logo button floats at a fixed inset and never
 * moves; the page keeps clear of it, and the open panel's header reserves the
 * same square, so opening and closing shift nothing.
 */
const MINIMAL_GEOMETRY = {
  // Distance of the logo button from the top and left edges.
  '--sidebar-minimal-inset': '0.5rem',
  '--sidebar-minimal-trigger': '3rem',
  // Distance of the open panel from the edges; the button sits inside it.
  '--sidebar-minimal-panel-inset': '0.25rem',
  // Page offset: the button plus the same inset on both sides.
  '--sidebar-minimal-gutter':
    'calc(var(--sidebar-minimal-inset) * 2 + var(--sidebar-minimal-trigger))',
  // Panel header centered on the button (inside the panel's 1px border).
  '--sidebar-minimal-header-height':
    'calc((var(--sidebar-minimal-inset) - var(--sidebar-minimal-panel-inset) - 1px) * 2 + var(--sidebar-minimal-trigger))',
  // Header content starts one brand gap after the button.
  '--sidebar-minimal-header-inset':
    'calc(var(--sidebar-minimal-inset) - var(--sidebar-minimal-panel-inset) - 1px + var(--sidebar-minimal-trigger) + 0.625rem)',
  // Concentric with the button's corners.
  '--sidebar-minimal-panel-radius':
    'calc(var(--radius) + var(--sidebar-minimal-inset) - var(--sidebar-minimal-panel-inset))',
} as const;

interface StructureProps {
  sidebarLabels?: { open: string; close: string };
  isCollapsed: boolean;
  mobileSidebarOpen?: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
  hideSizeToggle?: boolean;
  overlayOnExpand?: boolean;
  sidebarOverlayOpen?: boolean;
  header?: ReactNode;
  mobileHeader?: ReactNode;
  sidebarHeader?: ReactNode;
  sidebarContent?: ReactNode;
  actions?: ReactNode;
  userPopover?: ReactNode;
  notificationPopover?: ReactNode;
  sidebarUtility?: ReactNode;
  feedbackButton?: ReactNode;
  children: ReactNode;
  contentFullBleed?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  sidebarHidden?: boolean;
  /**
   * Only the logo rests on desktop; hover, keyboard focus or a tap opens the
   * full sidebar as a floating panel. Phones keep the top bar and drawer.
   */
  sidebarMinimal?: boolean;
  /** The logo shown on the minimal trigger. */
  minimalLogo?: ReactNode;
  sidebarCollapsedWidth?: string;
  sidebarExpandedWidth?: string;
  sidebarHeaderClassName?: string;
  sidebarHeaderHeight?: string;
}

export function Structure({
  isCollapsed,
  mobileSidebarOpen,
  setIsCollapsed,
  sidebarLabels,
  hideSizeToggle = false,
  overlayOnExpand = false,
  sidebarOverlayOpen = false,
  header,
  mobileHeader,
  sidebarHeader,
  sidebarContent,
  actions,
  userPopover,
  notificationPopover,
  sidebarUtility,
  feedbackButton,
  children,
  contentFullBleed = false,
  onMouseEnter,
  onMouseLeave,
  sidebarHidden = false,
  sidebarMinimal = false,
  minimalLogo,
  sidebarCollapsedWidth = '4rem',
  sidebarExpandedWidth = '16rem',
  sidebarHeaderClassName,
  sidebarHeaderHeight,
}: StructureProps) {
  const isMobile = useIsMobile();
  const panelId = useId();
  const isMinimal = sidebarMinimal && !sidebarHidden;
  const accountInTopBar = isMobile || (isMinimal && isCollapsed);
  // Minimal always opens over the page, whatever the shell passed.
  const overlay = overlayOnExpand || isMinimal;
  const revealTrigger = isMinimal && !isMobile;
  const overlayClose = useSidebarOverlayClose({
    enabled: overlay && !isMobile,
    externalOverlayOpen: sidebarOverlayOpen,
    isCollapsed,
    onMouseEnter,
    onMouseLeave,
    revealTrigger,
    openDelayMs: revealTrigger ? MINIMAL_OPEN_DELAY_MS : 0,
    closeDelayMs: revealTrigger ? MINIMAL_CLOSE_DELAY_MS : 0,
  });
  const overlayOpen = overlay && !isCollapsed;
  // Expand-on-hover with a rail; minimal mode has no rail to keep in place.
  const hoverRail = overlay && !isMinimal;
  const hoverPanelOpen = hoverRail && !isCollapsed;
  const minimalPanelOpen = isMinimal && !isCollapsed;
  const railUnderlay = useSidebarRailUnderlay({
    enabled: hoverRail && !isMobile,
    isOpen: hoverPanelOpen,
    isClosing: overlayClose.isClosing,
  });
  const mobileNavRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // Content clears the measured top bar, which grows with the top safe area
  // when the app runs from the home screen.
  useLayoutEffect(() => {
    if (sidebarHidden) return;
    const nav = mobileNavRef.current;
    const main = mainRef.current;
    if (nav && main) return observeMobileHeaderHeight(nav, main);
  }, [sidebarHidden]);

  const sidebarStyle = {
    '--sidebar-collapsed-width': sidebarCollapsedWidth,
    '--sidebar-expanded-width': sidebarExpandedWidth,
    // Width of the icon column in the rail: the collapsed width minus the 1px
    // edge border and the 0.5rem gutter on each side. Panel rows give their
    // icon the same slot, so every icon sits at one x in both states.
    '--sidebar-rail-slot': 'calc(var(--sidebar-collapsed-width) - 1rem - 1px)',
    ...MINIMAL_GEOMETRY,
    ...(sidebarHeaderHeight
      ? { '--sidebar-header-height': sidebarHeaderHeight }
      : {}),
  } as CSSProperties;

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isMobile && !sidebarHidden && (mobileSidebarOpen ?? !isCollapsed)) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isCollapsed, isMobile, mobileSidebarOpen, sidebarHidden]);

  return (
    <>
      {!sidebarHidden && (
        <nav
          ref={mobileNavRef}
          data-slot="mobile-top-bar"
          className="safe-top safe-x fixed inset-x-0 top-0 z-30 max-sm:border-b md:hidden"
        >
          <div className="bg-background/50 p-2 font-semibold backdrop-blur-md md:px-8 lg:px-16 xl:px-32">
            <div className="relative flex items-center justify-between gap-2 md:gap-4">
              <div className="flex w-full items-center gap-2">
                {mobileHeader}
              </div>
              <div className="flex w-fit items-center gap-2">
                {accountInTopBar && userPopover}
                <Button
                  size="icon"
                  variant="outline"
                  className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
                  aria-label={
                    isCollapsed ? sidebarLabels?.open : sidebarLabels?.close
                  }
                  onClick={() => setIsCollapsed(!isCollapsed)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </nav>
      )}

      <TooltipProvider delayDuration={0}>
        {!sidebarHidden && (mobileSidebarOpen ?? !isCollapsed) && (
          <button
            type="button"
            data-slot="sidebar-backdrop"
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-lg md:hidden"
            aria-label={sidebarLabels?.close}
            onClick={() => setIsCollapsed(true)}
          />
        )}
        <div className="relative w-full">
          {!sidebarHidden && (
            <SidebarOverlayContext value={overlayClose.registerOverlay}>
              <aside
                className={cn(
                  'group fixed top-0 right-0 left-auto z-50 flex h-dvh flex-col max-md:pt-[env(safe-area-inset-top,0px)] md:left-0 md:z-20',
                  // On desktop the minimal sidebar has no chrome of its own:
                  // it is the hover area, and the panel floats inside it.
                  isMinimal
                    ? 'max-md:overflow-hidden max-md:border-l max-md:backdrop-blur-lg'
                    : 'overflow-hidden border-l backdrop-blur-lg md:border-r md:border-l-0',
                  // The hover overlay never animates width: a width transition
                  // reflows the panel on every frame. The reveal is an
                  // opacity-only fade instead (see globals.css).
                  overlay
                    ? 'max-md:transition-transform max-md:duration-300 max-md:ease-in-out'
                    : 'transition-all duration-300 ease-in-out',
                  isCollapsed
                    ? 'w-[var(--sidebar-collapsed-width)] max-md:w-0'
                    : 'w-[var(--sidebar-expanded-width)] max-sm:w-full',
                  isMinimal
                    ? isCollapsed
                      ? 'max-md:bg-background/50 md:w-[var(--sidebar-minimal-gutter)]'
                      : 'max-md:bg-background md:w-[calc(var(--sidebar-expanded-width)+var(--sidebar-minimal-panel-inset)*2)]'
                    : isCollapsed
                      ? 'bg-background/50'
                      : 'bg-background',
                  // The open hover panel draws its own surface and edge, so
                  // both fade in over the rail instead of appearing at once.
                  hoverPanelOpen &&
                    'md:border-r-0 md:bg-transparent md:backdrop-blur-none',
                  isCollapsed && 'max-md:translate-x-full',
                  mobileSidebarOpen === false && 'max-md:hidden',
                  overlayOpen && 'md:z-40'
                )}
                data-minimal-sidebar={isMinimal || undefined}
                data-slot="app-sidebar"
                data-overlay-state={
                  overlayOpen
                    ? overlayClose.isClosing
                      ? 'closing'
                      : 'open'
                    : undefined
                }
                ref={overlayClose.panelRef}
                style={sidebarStyle}
              >
                {isMinimal && (
                  <SidebarMinimalTrigger
                    controls={panelId}
                    expanded={!isCollapsed}
                    label={
                      isCollapsed ? sidebarLabels?.open : sidebarLabels?.close
                    }
                    logo={minimalLogo}
                  />
                )}
                {/* A static copy of the last rail sits under the hover panel
                    while it fades, so rail icons never blink. */}
                {hoverRail && (
                  <div
                    ref={railUnderlay.hostRef}
                    aria-hidden
                    inert
                    data-slot="sidebar-rail-underlay"
                    className="pointer-events-none absolute inset-y-0 left-0 hidden w-[var(--sidebar-collapsed-width)] flex-col overflow-hidden border-r bg-background/50 backdrop-blur-lg md:flex md:empty:hidden"
                  />
                )}
                {/* In overlay mode the rail and the expanded panel are different
                    subtrees: remounting on the state flip means no element is
                    ever repositioned, so the swap cannot register as a layout
                    shift, and the new subtree fades in. Minimal has no rail. */}
                {isMinimal && isCollapsed ? null : (
                  <div
                    key={overlay ? (isCollapsed ? 'rail' : 'panel') : 'static'}
                    ref={
                      hoverRail && !isMobile && isCollapsed
                        ? railUnderlay.railRef
                        : null
                    }
                    id={isMinimal ? panelId : undefined}
                    data-sidebar-overlay-surface={
                      isMinimal || hoverPanelOpen ? '' : undefined
                    }
                    inert={
                      isMinimal && overlayClose.isClosing ? true : undefined
                    }
                    className={cn(
                      'flex min-h-0 flex-1 flex-col',
                      hoverPanelOpen && 'relative md:border-r md:bg-background',
                      minimalPanelOpen &&
                        'group-has-[[data-sidebar-reveal-trigger]:focus-visible:not([data-focus-modality=pointer]_*)]:ring-2 group-has-[[data-sidebar-reveal-trigger]:focus-visible:not([data-focus-modality=pointer]_*)]:ring-ring md:m-[var(--sidebar-minimal-panel-inset)] md:overflow-hidden md:rounded-[var(--sidebar-minimal-panel-radius)] md:border md:bg-background md:shadow-xl',
                      hoverPanelOpen &&
                        (overlayClose.isClosing
                          ? 'sidebar-overlay-content-out'
                          : 'sidebar-overlay-content'),
                      minimalPanelOpen &&
                        (overlayClose.isClosing
                          ? 'sidebar-minimal-conceal'
                          : 'sidebar-minimal-reveal')
                    )}
                  >
                    {/* Rail and panel headers have the same height, and the panel
                        brand's logo is centered on the rail, so the logo and
                        the icons below stay put when the rail expands. */}
                    <div
                      className={cn(
                        sidebarHeaderHeight
                          ? 'flex h-[var(--sidebar-header-height)] shrink-0 items-center px-2 py-1'
                          : 'flex min-h-12 items-center px-2 py-1',
                        isCollapsed && 'justify-center',
                        // The floating logo button stays above this header;
                        // its square is reserved and the brand starts after it.
                        minimalPanelOpen
                          ? 'md:h-[var(--sidebar-minimal-header-height)] md:min-h-0 md:shrink-0 md:py-0 md:pr-2 md:pl-[var(--sidebar-minimal-header-inset)]'
                          : 'md:px-0',
                        sidebarHeaderClassName
                      )}
                    >
                      <div
                        className={cn(
                          'flex min-h-13 w-full items-center',
                          isCollapsed
                            ? 'justify-center md:px-2'
                            : minimalPanelOpen
                              ? 'md:min-h-0'
                              : 'md:pr-2 md:pl-[calc((var(--sidebar-collapsed-width)-1px-2.25rem)/2)]'
                        )}
                      >
                        <div
                          className={cn(
                            'flex w-full items-center gap-2',
                            isCollapsed ? 'justify-center' : 'justify-between'
                          )}
                        >
                          {sidebarHeader}
                          {isCollapsed || (
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
                              aria-label={
                                isCollapsed
                                  ? sidebarLabels?.open
                                  : sidebarLabels?.close
                              }
                              onClick={() => setIsCollapsed(!isCollapsed)}
                            >
                              <X className="h-5 w-5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="scrollbar-none flex flex-1 flex-col gap-y-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                      {sidebarContent}
                    </div>
                    {(sidebarUtility || feedbackButton) && (
                      <div
                        data-slot="sidebar-utility-row"
                        className={cn(
                          'flex border-foreground/10 border-t',
                          isCollapsed
                            ? 'flex-col items-center gap-1 p-2'
                            : 'items-center gap-1 p-2'
                        )}
                      >
                        {sidebarUtility && (
                          <div
                            className={cn(
                              'flex',
                              isCollapsed
                                ? 'w-full justify-center'
                                : 'min-w-0 flex-1'
                            )}
                          >
                            {sidebarUtility}
                          </div>
                        )}
                        {feedbackButton}
                      </div>
                    )}
                    <div
                      className={cn(
                        'mt-auto flex border-foreground/10 border-t p-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]',
                        isCollapsed ? 'justify-center' : ''
                      )}
                    >
                      {isCollapsed ? (
                        <div className="flex w-full flex-col items-center gap-1">
                          {!accountInTopBar && userPopover}
                          {notificationPopover}
                        </div>
                      ) : (
                        actions
                      )}
                    </div>
                  </div>
                )}

                {!hideSizeToggle && !isMinimal && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="absolute top-1/2 -right-4 z-10 hidden h-auto w-auto -translate-y-1/2 rounded-full border-2 bg-background p-1.5 pl-1.5 opacity-0 transition duration-500 hover:bg-accent group-hover:opacity-100 md:block"
                    aria-label={
                      isCollapsed ? sidebarLabels?.open : sidebarLabels?.close
                    }
                    onClick={() => setIsCollapsed(!isCollapsed)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="mr-2 h-4 w-4" />
                    ) : (
                      <ChevronLeft className="mr-2 h-4 w-4" />
                    )}
                  </Button>
                )}
              </aside>
            </SidebarOverlayContext>
          )}
          {/* Main content area - overflow-y-auto removed to prevent double scrollbars */}
          {/* Body element now handles page-level scrolling */}
          <main
            ref={mainRef}
            className={cn(
              'relative flex flex-col overflow-x-clip',
              !overlay && 'transition-all duration-300 ease-in-out',
              contentFullBleed
                ? 'h-dvh min-h-0 overflow-y-hidden'
                : 'h-full min-h-screen overflow-y-visible',
              sidebarHidden
                ? 'md:pl-0'
                : isMinimal
                  ? 'md:pl-[var(--sidebar-minimal-gutter)]'
                  : isCollapsed || overlay
                    ? 'md:pl-[var(--sidebar-collapsed-width)]'
                    : 'md:pl-[var(--sidebar-expanded-width)]'
            )}
            style={sidebarStyle}
          >
            {header && <div className="mb-4 hidden md:block">{header}</div>}
            <div
              data-slot="structure-content"
              data-content-full-bleed={contentFullBleed ? 'true' : undefined}
              className={cn(
                'safe-bottom relative w-full',
                contentFullBleed
                  ? sidebarHidden
                    ? 'flex min-h-0 flex-1 flex-col'
                    : 'flex min-h-0 flex-1 flex-col pt-[var(--mobile-nav-height,calc(4.25rem+env(safe-area-inset-top,0px)))] md:pt-0'
                  : [
                      'h-full p-2 md:p-4 md:pt-4',
                      sidebarHidden
                        ? 'pt-2'
                        : 'pt-[calc(var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-top,0px)))+0.75rem)] pl-2',
                    ]
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </TooltipProvider>
    </>
  );
}
