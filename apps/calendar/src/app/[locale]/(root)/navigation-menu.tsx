'use client';

import { useNavigation } from './shared/navigation-config';
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
          <NavigationMenuTrigger className="group bg-linear-to-r font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5">
            <span className="flex items-center gap-2">
              {t('common.products')}
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-linear-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px] xl:w-[1000px] xl:grid-cols-3">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
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
          <NavigationMenuTrigger className="group bg-linear-to-r font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5">
            <span className="flex items-center gap-2">
              {t('common.solutions')}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {t('common.new')}
              </span>
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-linear-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px]">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
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
          <NavigationMenuTrigger className="group bg-linear-to-r font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5">
            {t('common.resources')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-linear-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px]">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
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
                'bg-linear-to-r px-6 font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5'
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
            'group relative block h-full space-y-1 rounded-md p-4 leading-none no-underline outline-hidden transition-all duration-300 select-none',
            'via-primary/10 to-primary/5 hover:bg-linear-to-br',
            'opacity-90 hover:opacity-100',
            'hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
          {...props}
        >
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                {icon}
              </div>
              <div className="text-sm leading-none font-semibold">{title}</div>
              {badge && (
                <Badge
                  variant="secondary"
                  className="ml-auto flex-none animate-pulse text-xs"
                >
                  {badge}
                </Badge>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-snug text-muted-foreground opacity-80 transition-opacity duration-300 group-hover:opacity-100">
              {children}
            </p>
          </div>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = 'ListItem';
