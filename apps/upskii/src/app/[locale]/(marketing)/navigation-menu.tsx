'use client';

import { useNavigation } from './shared/navigation-config';
import { Badge } from '@tuturuuu/ui/badge';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@tuturuuu/ui/navigation-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export function MainNavigationMenu() {
  const t = useTranslations();
  const { categories } = useNavigation(t);

  const main = categories.find((cat) => cat.title === 'main')?.items || [];
  const company =
    categories.find((cat) => cat.title === 'company')?.items || [];

  return (
    <NavigationMenu className="flex w-full max-w-none">
      <NavigationMenuList className="flex w-full justify-between">
        {main.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink
              href={item.href}
              className={cn(
                navigationMenuTriggerStyle(),
                'hover:bg-foreground/10 bg-transparent px-6 font-semibold transition-all duration-300'
              )}
            >
              {item.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}

        {company.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink
              href={item.href}
              className={cn(
                navigationMenuTriggerStyle(),
                'hover:bg-foreground/10 bg-transparent px-6 font-semibold transition-all duration-300'
              )}
            >
              <span className="flex items-center gap-2">{item.label}</span>
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
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
  }
>(({ className, title, icon, badge, disabled, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            'outline-hidden group relative block h-full select-none space-y-1 rounded-md p-4 leading-none no-underline transition-all duration-300',
            'via-primary/10 to-primary/5 hover:bg-gradient-to-br',
            'opacity-90 hover:opacity-100',
            'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]',
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
              <div className="text-sm font-semibold leading-none">{title}</div>
              {badge && (
                <Badge
                  variant="secondary"
                  className="ml-auto flex-none animate-pulse text-xs"
                >
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-2 line-clamp-2 text-sm leading-snug opacity-80 transition-opacity duration-300 group-hover:opacity-100">
              {children}
            </p>
          </div>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = 'ListItem';
