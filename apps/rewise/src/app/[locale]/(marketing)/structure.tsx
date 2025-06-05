'use client';

import { Nav } from './nav';
import { NavLink } from '@/components/navigation';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import {
  ChevronDown,
  Crown,
  Home,
  ImagePlay,
  MessagesSquare,
  WandSparkles,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useState } from 'react';

interface MailProps {
  locale: string;
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
  user: WorkspaceUser | null;
  links: NavLink[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export function Structure({
  locale,
  defaultLayout = [20, 80],
  defaultCollapsed = false,
  navCollapsedSize,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const t = useTranslations();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (!user) return null;

  const rootLinks: NavLink[] = [
    {
      href: '/new',
      aliases: ['/'],
      title: t('common.home'),
      icon: <Home className="h-5 w-5 flex-none" />,
      matchExact: true,
    },
    {
      href: '/tools',
      title: t('common.tools'),
      icon: <WandSparkles className="h-5 w-5 flex-none" />,
    },
    {
      href: '/imagine',
      title: t('common.image_generator'),
      icon: <ImagePlay className="h-5 w-5 flex-none" />,
    },
    {
      href: '/plans',
      title: t('common.current_plan'),
      icon: <Crown className="h-5 w-5 flex-none" />,
      trailing: (
        <span className="bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 font-semibold text-transparent">
          {t('common.premium')}
        </span>
      ),
      disabled: true,
      showDisabled: true,
    },
  ];

  // Save sidebar sizes to cookie
  const debouncedSaveSizes = (sizes: { sidebar: number; main: number }) => {
    document.cookie = `react-resizable-panels:layout:rewise=${JSON.stringify([
      sizes.sidebar,
      sizes.main,
    ])}`;
  };

  // Save sidebar collapsed state to cookie
  const debouncedSaveCollapsed = (collapsed: boolean) => {
    document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
      collapsed
    )}`;
  };

  const sidebarHeader = (
    <Link href="/new" className="flex w-full items-center gap-2">
      <div
        className={cn(
          isCollapsed
            ? 'flex w-full items-center justify-center'
            : 'inline-block w-fit',
          'flex-none'
        )}
      >
        <Image
          src="/media/logos/transparent.png"
          className="h-8 w-8"
          width={32}
          height={32}
          alt="logo"
        />
      </div>
      {isCollapsed || (
        <LogoTitle
          text="Rewise"
          className={cn(
            'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
            'text-4xl font-bold md:text-3xl lg:text-4xl'
          )}
        />
      )}
    </Link>
  );

  const sidebarContent = (
    <div className="flex flex-1 flex-col gap-2">
      <Nav
        t={t}
        locale={locale}
        currentUser={user}
        isCollapsed={isCollapsed}
        links={rootLinks}
        onClick={() => {
          if (window.innerWidth < 768) setIsCollapsed(true);
        }}
        className="pb-0"
        single
      />
      {isCollapsed || <Separator />}
      <Accordion
        type="single"
        className={cn('w-full', isCollapsed && 'hidden')}
        collapsible
      >
        <AccordionItem value="item-1" className="border-none p-0">
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
              currentUser={user}
              isCollapsed={isCollapsed}
              links={links}
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
  );

  const mobileHeader = (
    <div className="flex flex-none items-center gap-2">
      <Link href="/new" className="flex flex-none items-center gap-2">
        <Image
          src="/media/logos/transparent.png"
          className="h-8 w-8"
          width={32}
          height={32}
          alt="logo"
        />
        <LogoTitle
          text="Rewise"
          className={cn(
            'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
            'text-4xl font-bold md:text-3xl lg:text-4xl'
          )}
        />
      </Link>
    </div>
  );

  return (
    <BaseStructure
      defaultLayout={defaultLayout}
      navCollapsedSize={navCollapsedSize}
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      debouncedSaveSizes={debouncedSaveSizes}
      debouncedSaveCollapsed={debouncedSaveCollapsed}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
      children={children}
    />
  );
}
