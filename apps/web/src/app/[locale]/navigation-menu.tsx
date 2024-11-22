'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@repo/ui/components/ui/badge';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@repo/ui/components/ui/navigation-menu';
import {
  Archive,
  Banknote,
  Brain,
  Calendar,
  CircleCheck,
  FileText,
  GraduationCap,
  HardDrive,
  Mail,
  Users,
  UsersRound,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

const products = [
  {
    title: 'Meet Together',
    href: '/calendar/meet-together',
    description: 'Schedule meetings effortlessly across time zones and teams.',
    icon: <UsersRound className="h-4 w-4" />,
  },
  {
    title: 'AI Assistant',
    href: '/products/ai',
    description: 'Leverage AI to automate tasks and enhance productivity.',
    icon: <Brain className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'LMS',
    href: '/products/lms',
    description: 'Deliver and track educational content effectively.',
    icon: <GraduationCap className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Calendar',
    href: '/products/calendar',
    description: 'Comprehensive calendar and event management system.',
    icon: <Calendar className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Documents',
    href: '/products/documents',
    description: 'AI-powered document management and collaboration.',
    icon: <FileText className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Drive',
    href: '/products/drive',
    description: 'Secure cloud storage with seamless file sharing.',
    icon: <HardDrive className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'CRM',
    href: '/products/crm',
    description: 'Build and maintain valuable customer relationships.',
    icon: <Users className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Inventory',
    href: '/products/inventory',
    description: 'Streamline inventory control and stock management.',
    icon: <Archive className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Finance',
    href: '/products/finance',
    description: 'Track finances and manage transactions efficiently.',
    icon: <Banknote className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Mail',
    href: '/products/mail',
    description: 'Powerful email and communication management.',
    icon: <Mail className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Tasks',
    href: '/products/tasks',
    description: 'Organize and track projects with clarity.',
    icon: <CircleCheck className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
  {
    title: 'Workflows',
    href: '/products/workflows',
    description: 'Automate and optimize your business processes.',
    icon: <Workflow className="h-4 w-4" />,
    badge: 'Coming Soon',
  },
];

export function MainNavigationMenu() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="font-semibold">
            Products
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              {products.map((product) => (
                <ListItem
                  key={product.title}
                  title={product.title}
                  href={product.href}
                >
                  {product.description}
                </ListItem>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/pricing" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(navigationMenuTriggerStyle(), 'font-semibold')}
            >
              Pricing
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/about" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(navigationMenuTriggerStyle(), 'font-semibold')}
            >
              About
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <Link href="/contact" legacyBehavior passHref>
            <NavigationMenuLink
              className={cn(navigationMenuTriggerStyle(), 'font-semibold')}
            >
              Contact
            </NavigationMenuLink>
          </Link>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<'a'>,
  React.ComponentPropsWithoutRef<'a'>
>(({ className, title, children, ...props }, ref) => {
  const product = products.find((p) => p.title === title);

  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors',
            'opacity-80 hover:opacity-100',
            'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
            className
          )}
          {...props}
        >
          <div className="flex items-center gap-2">
            {product?.icon}
            <div className="text-sm font-semibold leading-none">{title}</div>
            {product?.badge && (
              <Badge variant="secondary" className="ml-auto flex-none text-xs">
                {product.badge}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-snug opacity-80">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = 'ListItem';
