import {
  Bot,
  Boxes,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  FileText,
  Folder,
  GraduationCap,
  Mail,
  MessageSquare,
  Package,
  QrCode,
  Store,
  Users,
  Wallet,
  Zap,
} from '@tuturuuu/icons/lucide-static';
import type { ComponentType } from 'react';

export interface MarketingProduct {
  /** Translation key under `marketing-nav.products.*`. */
  key: string;
  href: string;
  /** Static accent class — Tailwind cannot resolve interpolated names. */
  accent: string;
}

export type MarketingProductIcon = ComponentType<{ className?: string }>;

/**
 * Icon per product key.
 *
 * Lives beside the group data rather than in the navbar, because the mega-menu
 * and the `/products` index both draw the same set — a second copy would drift
 * the moment a product is added to one and not the other.
 */
export const MARKETING_PRODUCT_ICONS: Record<string, MarketingProductIcon> = {
  ai: Bot,
  calendar: Calendar,
  chat: MessageSquare,
  crm: Building2,
  documents: FileText,
  drive: Folder,
  finance: Wallet,
  forms: FileText,
  hive: Boxes,
  inventory: Package,
  lms: GraduationCap,
  mail: Mail,
  meet: Users,
  qr: QrCode,
  storefront: Store,
  tasks: CheckCircle2,
  track: CalendarClock,
  workflows: Zap,
};

export interface MarketingProductGroup {
  /** Translation key under `marketing-nav.groups.*`. */
  key: string;
  items: MarketingProduct[];
}

/**
 * Product mega-menu contents.
 *
 * Kept out of `shared/navigation-config.tsx` on purpose: the public-shell
 * compile-graph test forbids a `products` category there, and this module is
 * only pulled in by the marketing navbar rather than every public route.
 *
 * Every entry points at a marketing `/products/*` page. The link into the
 * running app is the primary CTA on that page, so visitors always meet the
 * product before the product's login screen.
 */
export const MARKETING_PRODUCT_GROUPS: MarketingProductGroup[] = [
  {
    key: 'plan',
    items: [
      {
        key: 'calendar',
        href: '/products/calendar',
        accent: 'text-dynamic-blue',
      },
      { key: 'tasks', href: '/products/tasks', accent: 'text-dynamic-green' },
      {
        key: 'meet',
        href: '/products/meet-together',
        accent: 'text-dynamic-purple',
      },
      {
        key: 'workflows',
        href: '/products/workflows',
        accent: 'text-dynamic-cyan',
      },
      { key: 'track', href: '/products/track', accent: 'text-dynamic-orange' },
      { key: 'forms', href: '/products/forms', accent: 'text-dynamic-indigo' },
    ],
  },
  {
    key: 'create',
    items: [
      {
        key: 'documents',
        href: '/products/documents',
        accent: 'text-dynamic-orange',
      },
      { key: 'drive', href: '/products/drive', accent: 'text-dynamic-yellow' },
      { key: 'mail', href: '/products/mail', accent: 'text-dynamic-red' },
      { key: 'chat', href: '/products/chat', accent: 'text-dynamic-cyan' },
      { key: 'ai', href: '/products/ai', accent: 'text-dynamic-purple' },
      { key: 'qr', href: '/products/qr', accent: 'text-dynamic-sky' },
    ],
  },
  {
    key: 'operate',
    items: [
      {
        key: 'finance',
        href: '/products/finance',
        accent: 'text-dynamic-pink',
      },
      { key: 'crm', href: '/products/crm', accent: 'text-dynamic-blue' },
      {
        key: 'inventory',
        href: '/products/inventory',
        accent: 'text-dynamic-green',
      },
      {
        key: 'storefront',
        href: '/products/storefront',
        accent: 'text-dynamic-teal',
      },
      { key: 'hive', href: '/products/hive', accent: 'text-dynamic-rose' },
      { key: 'lms', href: '/products/lms', accent: 'text-dynamic-orange' },
    ],
  },
];
