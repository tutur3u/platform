'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { BookText, Building, Zap } from '@tuturuuu/ui/icons';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@tuturuuu/ui/navigation-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useNavigation } from './shared/navigation-config';

export function MainNavigationMenu() {
  const t = useTranslations();
  const { categories } = useNavigation(t);

  const products =
    categories.find((cat) => cat.title === 'products')?.items || [];
  const solutions =
    categories.find((cat) => cat.title === 'solutions')?.items || [];
  const resources =
    categories.find((cat) => cat.title === 'resources')?.items || [];
  const company =
    categories.find((cat) => cat.title === 'company')?.items || [];

  return (
    <NavigationMenu className="flex w-full max-w-none">
      <NavigationMenuList className="flex w-full justify-between">
        <NavigationMenuItem>
          <NavigationMenuTrigger className="group rounded-lg bg-transparent font-semibold transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300">
            <span className="flex items-center gap-2">
              {t('common.products')}
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500/50 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
              </span>
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 rounded-xl border-0 bg-white/95 p-6 shadow-xl backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px] xl:w-[1000px] xl:grid-cols-3 dark:bg-gray-900/95">
              <Card className="col-span-full mb-2 bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-950/20 dark:to-purple-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                  <Zap className="h-4 w-4" />
                  <span>Featured Products</span>
                </div>
              </Card>
              {products.map((product) => (
                <ListItem
                  key={product.href}
                  title={product.label}
                  href={product.href}
                  icon={product.icon}
                  badge={product.badge}
                >
                  {product.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuTrigger className="group rounded-lg bg-transparent font-semibold transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300">
            <span className="flex items-center gap-2">
              {t('common.solutions')}
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-300">
                {t('common.new')}
              </span>
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 rounded-xl border-0 bg-white/95 p-6 shadow-xl backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px] dark:bg-gray-900/95">
              <Card className="col-span-full mb-2 bg-gradient-to-r from-green-50 to-emerald-50 p-4 dark:from-green-950/20 dark:to-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-300">
                  <Building className="h-4 w-4" />
                  <span>Industry Solutions</span>
                </div>
              </Card>
              {solutions.map((solution) => (
                <ListItem
                  key={solution.href}
                  title={solution.label}
                  href={solution.href}
                  icon={solution.icon}
                >
                  {solution.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuTrigger className="group rounded-lg bg-transparent font-semibold transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300">
            {t('common.resources')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 rounded-xl border-0 bg-white/95 p-6 shadow-xl backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px] dark:bg-gray-900/95">
              <Card className="col-span-full mb-2 bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:from-orange-950/20 dark:to-amber-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-300">
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
                >
                  {resource.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {company.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink
              href={item.href}
              className={cn(
                navigationMenuTriggerStyle(),
                'rounded-lg bg-transparent px-6 font-semibold transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300'
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
            'group relative block h-full space-y-2 rounded-lg p-4 leading-none no-underline outline-hidden transition-all duration-200 select-none',
            'bg-white/50 hover:bg-gradient-to-br hover:from-blue-50 hover:to-purple-50 dark:bg-gray-800/50 dark:hover:from-blue-950/20 dark:hover:to-purple-950/20',
            'border border-gray-200/50 hover:border-blue-200 dark:border-gray-700/50 dark:hover:border-blue-700',
            'opacity-90 hover:opacity-100',
            'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
          {...props}
        >
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white transition-all duration-200 group-hover:scale-110 group-hover:rotate-3">
                {icon}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {title}
                </div>
              </div>
              {badge && (
                <Badge
                  variant="secondary"
                  className="ml-auto flex-none animate-pulse bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                >
                  {badge}
                </Badge>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-snug text-muted-foreground opacity-80 transition-opacity duration-200 group-hover:opacity-100">
              {children}
            </p>
          </div>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = 'ListItem';
