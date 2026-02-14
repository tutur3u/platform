'use client';

import { Badge } from '@ncthub/ui/badge';
import { Card } from '@ncthub/ui/card';
import { BookText, Gamepad2, Zap } from '@ncthub/ui/icons';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@ncthub/ui/navigation-menu';
import { cn } from '@ncthub/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React from 'react';
import { useNavigation } from './shared/navigation-config';

export function MainNavigationMenu() {
  const t = useTranslations();
  const { categories } = useNavigation(t);

  const mainLinks =
    categories
      .find((cat) => cat.title === 'main')
      ?.items.filter((item) => item.href !== `/`) || [];
  const resources =
    categories.find((cat) => cat.title === 'resources')?.items || [];
  const utilities =
    categories.find((cat) => cat.title === 'utilities')?.items || [];
  const games = categories.find((cat) => cat.title === 'games')?.items || [];

  return (
    <NavigationMenu className="flex w-full max-w-none">
      <NavigationMenuList className="flex w-full justify-between">
        {mainLinks.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink
              href={item.href}
              className={cn(
                navigationMenuTriggerStyle(),
                'bg-transparent px-6 font-semibold transition-all duration-300 hover:bg-foreground/5'
              )}
            >
              <span className="flex items-center gap-2">{item.label}</span>
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}

        <NavigationMenuItem>
          <NavigationMenuTrigger className="group bg-transparent font-semibold transition-all duration-300 hover:bg-foreground/5">
            {t('common.resources')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-linear-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px]">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <BookText className="h-4 w-4" />
                  <span>Learning Resources</span>
                </div>
              </Card>
              {resources.map((resource) => (
                <ListItem
                  key={resource.href}
                  title={resource.label}
                  href={resource.href}
                  icon={resource.icon}
                  external={resource.external}
                >
                  {resource.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuTrigger className="group bg-transparent font-semibold transition-all duration-300 hover:bg-foreground/5">
            {t('common.utilities')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-linear-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px] xl:w-[1000px] xl:grid-cols-3">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Zap className="h-4 w-4" />
                  <span>Utilities</span>
                </div>
              </Card>
              {utilities.map((utility) => (
                <ListItem
                  key={utility.href}
                  title={utility.label}
                  href={utility.href}
                  icon={utility.icon}
                  badge={utility.badge}
                >
                  {utility.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuTrigger className="group bg-transparent font-semibold transition-all duration-300 hover:bg-foreground/5">
            {t('common.games')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-linear-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px]">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Gamepad2 className="h-4 w-4" />
                  <span>Games</span>
                </div>
              </Card>
              {games.map((game) => (
                <ListItem
                  key={game.href}
                  title={game.label}
                  href={game.href}
                  icon={game.icon}
                >
                  {game.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

const ListItem = React.forwardRef<
  React.ComponentRef<'a'>,
  React.ComponentPropsWithoutRef<'a'> & {
    title: string;
    icon: React.ReactNode;
    badge?: string;
    disabled?: boolean;
    external?: boolean;
  }
>(
  (
    {
      className,
      href,
      title,
      icon,
      badge,
      disabled,
      external,
      children,
      ...props
    },
    ref
  ) => {
    if (!href) return null;
    return (
      <li>
        <NavigationMenuLink asChild>
          <Link
            href={href}
            ref={ref}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className={cn(
              'group relative block h-full select-none space-y-1 rounded-md border border-transparent p-4 leading-none no-underline outline-hidden transition-all duration-300',
              'opacity-90 hover:opacity-100',
              'hover:scale-[1.02] hover:border-border active:scale-[0.98]',
              disabled && 'cursor-not-allowed opacity-50',
              className
            )}
            {...props}
          >
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="text-primary transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
                  {icon}
                </div>
                <div className="font-semibold text-sm leading-none">
                  {title}
                </div>
                {badge && (
                  <Badge
                    variant="secondary"
                    className="ml-auto flex-none animate-pulse text-xs"
                  >
                    {badge}
                  </Badge>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-muted-foreground text-sm leading-snug opacity-80 transition-opacity duration-300 group-hover:opacity-100">
                {children}
              </p>
            </div>
          </Link>
        </NavigationMenuLink>
      </li>
    );
  }
);
ListItem.displayName = 'ListItem';
