'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MessagesSquare } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Separator } from '@tuturuuu/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { setCookie } from 'cookies-next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { NavLink as ChatNavLink } from '@/components/navigation';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { useSidebar } from '@/context/sidebar-context';
import { Nav } from './nav';
import { WorkspaceSelect } from './workspace-select';

interface StructureProps {
  wsId: string;
  personalOrWsId: string;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export function Structure({
  wsId,
  personalOrWsId,
  defaultCollapsed = false,
  links,
  actions,
  userPopover,
  children,
}: StructureProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();

  const { behavior, handleBehaviorChange } = useSidebar();
  const [initialized, setInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (behavior === 'collapsed' || behavior === 'hover') {
      setIsCollapsed(true);
    } else {
      setIsCollapsed(false);
    }
  }, [behavior]);

  // Load chats client-side using TanStack Query
  const { data: chats } = useQuery({
    queryKey: ['ai-chats'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('ai_chats')
        .select('*')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  // Convert chats to ChatNavLink format for the Nav component
  const chatLinks: ChatNavLink[] = (chats || []).map((chat) => ({
    title: chat.title || t('ai_chat.untitled'),
    href: `/${personalOrWsId}/c/${chat.id}`,
    createdAt: chat.created_at,
    pinned: chat.pinned ?? false,
  }));

  const handleToggle = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    setCookie(SIDEBAR_COLLAPSED_COOKIE_NAME, newCollapsed);

    if (behavior === 'expanded' && newCollapsed) {
      handleBehaviorChange('collapsed');
    } else if (behavior === 'collapsed' && !newCollapsed) {
      handleBehaviorChange('expanded');
    }
  };

  const isHoverMode = behavior === 'hover';

  const hasOpenDialogs = useCallback(() => {
    const hasDialogs =
      document.querySelector('[data-state="open"][role="dialog"]') !== null;
    const hasAlertDialogs =
      document.querySelector('[data-state="open"][role="alertdialog"]') !==
      null;
    return hasDialogs || hasAlertDialogs;
  }, []);

  const onMouseEnter = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) {
          setIsCollapsed(false);
        }
      }
    : undefined;

  const onMouseLeave = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) {
          setIsCollapsed(true);
        }
      }
    : undefined;

  // Check if a static nav link is active
  const isNavLinkActive = useCallback(
    (link: NavLink) => {
      if (link.matchExact) {
        if (pathname === link.href) return true;
        return link.aliases?.some((a) => pathname === a) ?? false;
      }
      if (link.href && pathname.startsWith(link.href)) return true;
      return link.aliases?.some((a) => pathname.startsWith(a)) ?? false;
    },
    [pathname]
  );

  const sidebarHeader = (
    <>
      {isCollapsed || wsId === ROOT_WORKSPACE_ID || (
        <Link
          href={`/${personalOrWsId}/new`}
          className="flex flex-none items-center gap-2"
        >
          <div className="flex-none">
            <TuturuuLogo
              className="h-6 w-6"
              width={32}
              height={32}
              alt="logo"
            />
          </div>
          <LogoTitle
            text="Rewise"
            className={cn(
              'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
              'font-bold text-2xl'
            )}
          />
        </Link>
      )}

      <Suspense
        fallback={
          <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
        }
      >
        <WorkspaceSelect t={t} wsId={wsId} hideLeading={isCollapsed} />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <div className="flex h-full flex-1 flex-col gap-2 overflow-hidden">
      {/* Static Navigation Links */}
      <div className="px-2 pt-2">
        <nav
          className={cn('grid', isCollapsed ? 'justify-center gap-1' : 'gap-1')}
        >
          {links.filter(Boolean).map((link) => {
            if (!link) return null;
            const active = isNavLinkActive(link);

            return isCollapsed ? (
              <Tooltip key={link.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={link.href || '#'}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                      active
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                    )}
                    onClick={() => {
                      if (window.innerWidth < 768) setIsCollapsed(true);
                    }}
                  >
                    {link.icon}
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="border bg-background text-foreground"
                >
                  {link.title}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                key={link.href}
                href={link.href || '#'}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                )}
                onClick={() => {
                  if (window.innerWidth < 768) setIsCollapsed(true);
                }}
              >
                {link.icon}
                <span className="line-clamp-1">{link.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Separator before chats section */}
      {isCollapsed || <Separator className="mx-2" />}

      {/* Chats Section */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Accordion
          type="single"
          className={cn('w-full', isCollapsed && 'hidden')}
          collapsible
        >
          <AccordionItem value="chats" className="border-none p-0">
            <AccordionTrigger
              showChevron={false}
              className="mx-2 mb-0 rounded-md bg-foreground/5 px-3 py-2 hover:bg-foreground/10"
            >
              <div className="flex items-center gap-2">
                <MessagesSquare className="h-5 w-5 flex-none" />
                <span className="line-clamp-1 text-start text-sm">
                  {t('ai_chat.chats')}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
            </AccordionTrigger>
            <AccordionContent>
              <Nav
                t={t}
                locale={locale}
                basePath={`/${personalOrWsId}`}
                currentUser={null}
                isCollapsed={isCollapsed}
                links={chatLinks}
                onClick={() => {
                  if (window.innerWidth < 768) setIsCollapsed(true);
                }}
                single={false}
                className="pt-0"
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );

  const mobileHeader = (
    <>
      <div className="flex flex-none items-center gap-2">
        <Link
          href={`/${personalOrWsId}/new`}
          className="flex flex-none items-center gap-2"
        >
          <TuturuuLogo className="h-8 w-8" width={32} height={32} alt="logo" />
        </Link>
      </div>
      <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      <LogoTitle
        text="Rewise"
        className={cn(
          'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
          'font-bold text-2xl'
        )}
      />
    </>
  );

  if (!initialized) return null;

  return (
    <BaseStructure
      isCollapsed={isCollapsed}
      setIsCollapsed={handleToggle}
      header={null}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      hideSizeToggle={behavior === 'hover'}
      overlayOnExpand={behavior === 'hover'}
    >
      {children}
    </BaseStructure>
  );
}
