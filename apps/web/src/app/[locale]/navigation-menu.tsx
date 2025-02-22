'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
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
import {
  Archive,
  Banknote,
  BookText,
  Brain,
  Building,
  Calendar,
  CircleCheck,
  Factory,
  FileText,
  Github,
  GraduationCap,
  HardDrive,
  HardHat,
  Hotel,
  Mail,
  Paintbrush,
  Pill,
  Presentation,
  Shield,
  Store,
  Users,
  UsersRound,
  Utensils,
  Workflow,
  Zap,
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
      title: t('common.manufacturing'),
      href: '/solutions/manufacturing',
      description: t('common.manufacturing-description'),
      icon: <Factory className="h-4 w-4" />,
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
    {
      title: t('common.retail'),
      href: '/solutions/retail',
      description: t('common.retail-description'),
      icon: <Store className="h-4 w-4" />,
    },
    {
      title: t('common.education'),
      href: '/solutions/education',
      description: t('common.education-description'),
      icon: <GraduationCap className="h-4 w-4" />,
    },
    {
      title: t('common.hospitality'),
      href: '/solutions/hospitality',
      description: t('common.hospitality-description'),
      icon: <Hotel className="h-4 w-4" />,
    },
    {
      title: t('common.construction'),
      href: '/solutions/construction',
      description: t('common.construction-description'),
      icon: <HardHat className="h-4 w-4" />,
    },
  ];

  const resources = [
    {
      title: t('common.blog'),
      href: '/blog',
      description: t('common.blog-description'),
      icon: <BookText className="h-4 w-4" />,
      badge: t('common.coming_soon'),
    },
    {
      title: t('common.changelog'),
      href: '/changelog',
      description: t('common.changelog-description'),
      icon: <FileText className="h-4 w-4" />,
    },
    {
      title: t('common.security'),
      href: '/security',
      description: t('common.security-description'),
      icon: <Shield className="h-4 w-4" />,
    },
    {
      title: t('common.pitch'),
      href: '/pitch',
      description: t('common.pitch-description'),
      icon: <Presentation className="h-4 w-4" />,
    },
    {
      title: t('common.branding'),
      href: '/branding',
      description: t('common.branding-description'),
      icon: <Paintbrush className="h-4 w-4" />,
    },
    {
      title: t('common.documentation'),
      href: 'https://docs.tuturuuu.com',
      description: t('common.documentation-description'),
      icon: <FileText className="h-4 w-4" />,
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
          <NavigationMenuTrigger className="group bg-gradient-to-r font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5">
            <span className="flex items-center gap-2">
              {t('common.products')}
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-gradient-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px] xl:w-[1000px] xl:grid-cols-3">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4" />
                  <span>Featured Products</span>
                </div>
              </Card>
              {products.map((product) => (
                <ListItem
                  key={product.title}
                  title={product.title}
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
          <NavigationMenuTrigger className="group bg-gradient-to-r font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5">
            <span className="flex items-center gap-2">
              {t('common.solutions')}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {t('common.new')}
              </span>
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-gradient-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px]">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Building className="h-4 w-4" />
                  <span>Industry Solutions</span>
                </div>
              </Card>
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
          <NavigationMenuTrigger className="group bg-gradient-to-r font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5">
            {t('common.resources')}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 bg-gradient-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:w-[500px] md:grid-cols-2 lg:w-[800px]">
              <Card className="col-span-full mb-2 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BookText className="h-4 w-4" />
                  <span>Learning Resources</span>
                </div>
              </Card>
              {resources.map((resource) => (
                <ListItem
                  key={resource.title}
                  title={resource.title}
                  href={resource.href}
                  icon={resource.icon}
                  badge={resource.badge}
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
              className={cn(
                navigationMenuTriggerStyle(),
                'group bg-gradient-to-r px-6 font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5'
              )}
            >
              <span className="flex items-center gap-2">
                {t('common.pricing')}
              </span>
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <Link href="/about" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(
                navigationMenuTriggerStyle(),
                'bg-gradient-to-r px-6 font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5'
              )}
            >
              {t('common.about')}
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <Link href="/careers" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(
                navigationMenuTriggerStyle(),
                'group bg-gradient-to-r px-6 font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5'
              )}
            >
              <span className="flex items-center gap-2">
                {t('common.careers')}
              </span>
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <Link href="/contact" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(
                navigationMenuTriggerStyle(),
                'bg-gradient-to-r px-6 font-semibold transition-all duration-300 hover:from-primary/10 hover:to-primary/5'
              )}
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
            'group relative block h-full space-y-1 rounded-md p-4 leading-none no-underline outline-hidden transition-all duration-300 select-none',
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
