'use client';

import { Badge } from '@tutur3u/ui/badge';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@tutur3u/ui/navigation-menu';
import { cn } from '@tutur3u/utils/format';
import {
  Archive,
  Banknote,
  BookText,
  Brain,
  Building,
  Calendar,
  CircleCheck,
  FileText,
  Github,
  GraduationCap,
  HardDrive,
  Mail,
  Paintbrush,
  Pill,
  Users,
  UsersRound,
  Utensils,
  Workflow,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';

export function MainNavigationMenu() {
  const t = useTranslations();

  const products = [
    {
      title: t('common.meet-together'),
      href: '/meet-together',
      description: t('common.meet-together-description'),
      icon: <UsersRound className="h-4 w-4" />,
    },
    {
      title: t('common.ai-assistant'),
      href: '/products/ai',
      description: t('common.ai-assistant-description'),
      icon: <Brain className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.lms'),
      href: '/products/lms',
      description: t('common.lms-description'),
      icon: <GraduationCap className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.calendar'),
      href: '/products/calendar',
      description: t('common.calendar-description'),
      icon: <Calendar className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.documents'),
      href: '/products/documents',
      description: t('common.documents-description'),
      icon: <FileText className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.drive'),
      href: '/products/drive',
      description: t('common.drive-description'),
      icon: <HardDrive className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.crm'),
      href: '/products/crm',
      description: t('common.crm-description'),
      icon: <Users className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.inventory'),
      href: '/products/inventory',
      description: t('common.inventory-description'),
      icon: <Archive className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.finance'),
      href: '/products/finance',
      description: t('common.finance-description'),
      icon: <Banknote className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.mail'),
      href: '/products/mail',
      description: t('common.mail-description'),
      icon: <Mail className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.tasks'),
      href: '/products/tasks',
      description: t('common.tasks-description'),
      icon: <CircleCheck className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.workflows'),
      href: '/products/workflows',
      description: t('common.workflows-description'),
      icon: <Workflow className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
  ];

  const solutions = [
    {
      title: t('common.education'),
      href: '/solutions/education',
      description: t('common.education-description'),
      icon: <GraduationCap className="h-4 w-4" />,
    },
    {
      title: t('common.restaurants'),
      href: '/solutions/restaurants',
      description: t('common.restaurants-description'),
      icon: <Utensils className="h-4 w-4" />,
    },
    {
      title: t('common.pharmacies'),
      href: '/solutions/pharmacies',
      description: t('common.pharmacies-description'),
      icon: <Pill className="h-4 w-4" />,
    },
    {
      title: t('common.realestate'),
      href: '/solutions/realestate',
      description: t('common.realestate-description'),
      icon: <Building className="h-4 w-4" />,
    },
  ];

  const resources = [
    {
      title: t('common.blog'),
      href: '/blog',
      description: t('common.blog-description'),
      icon: <BookText className="h-4 w-4" />,
      disabled: true,
    },
    {
      title: t('common.documentation'),
      href: 'https://docs.tuturuuu.com',
      description: t('common.documentation-description'),
      icon: <FileText className="h-4 w-4" />,
    },
    {
      title: t('common.branding'),
      href: '/branding',
      description: t('common.branding-description'),
      icon: <Paintbrush className="h-4 w-4" />,
    },
    {
      title: 'GitHub',
      href: 'https://github.com/tutur3u',
      description: t('common.github-description'),
      icon: <Github className="h-4 w-4" />,
    },
  ];

  return (
    <NavigationMenu className="flex w-full max-w-none">
      <NavigationMenuList className="flex w-full justify-between">
        <NavigationMenuItem>
          <NavigationMenuTrigger className="font-semibold">
            {t('common.products')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[700px] xl:w-[1000px] xl:grid-cols-3">
              {products.map((product) => (
                <ListItem
                  key={product.title}
                  title={product.title}
                  href={product.href}
                  icon={product.icon}
                >
                  {product.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="font-semibold">
            {t('common.solutions')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[700px]">
              {solutions.map((solution) => (
                <ListItem
                  key={solution.title}
                  title={solution.title}
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
          <NavigationMenuTrigger className="font-semibold">
            {t('common.resources')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[700px]">
              {resources.map((resource) => (
                <ListItem
                  key={resource.title}
                  title={resource.title}
                  href={resource.href}
                  icon={resource.icon}
                >
                  {resource.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/pricing" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(navigationMenuTriggerStyle(), 'px-6 font-semibold')}
            >
              {t('common.pricing')}
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/about" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(navigationMenuTriggerStyle(), 'px-6 font-semibold')}
            >
              {t('common.about')}
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/contact" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(navigationMenuTriggerStyle(), 'px-6 font-semibold')}
            >
              {t('common.contact')}
            </NavigationMenuLink>
          </Link>
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
  }
>(({ className, title, icon, badge, disabled, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            'block h-full space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors select-none',
            'opacity-80 hover:opacity-100',
            'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
          {...props}
        >
          <div className="flex items-center gap-2">
            {icon}
            <div className="text-sm leading-none font-semibold">{title}</div>
            {badge && (
              <Badge variant="secondary" className="ml-auto flex-none text-xs">
                {badge}
              </Badge>
            )}
          </div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground opacity-80">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = 'ListItem';
