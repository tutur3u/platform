'use client';

import {
  ArrowRight,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Folder,
  GraduationCap,
  Mail,
  Package,
  Users,
  Wallet,
  Zap,
} from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { useNavigation } from '../shared/navigation-config';
import { NavDropdown } from './nav-dropdown';
import { MARKETING_PRODUCT_GROUPS } from './products';

type IconComponent = ComponentType<{ className?: string }>;

const productIcons: Record<string, IconComponent> = {
  calendar: Calendar,
  tasks: CheckCircle2,
  meet: Users,
  workflows: Zap,
  documents: FileText,
  drive: Folder,
  mail: Mail,
  ai: Bot,
  finance: Wallet,
  crm: Building2,
  inventory: Package,
  lms: GraduationCap,
};

const linkClassName = cn(
  'inline-flex h-9 items-center rounded-lg px-3 font-medium text-foreground/70 text-sm transition-colors',
  'hover:bg-foreground/5 hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
);

export function MarketingNavMenu() {
  const t = useTranslations();
  const { categories } = useNavigation(t);

  const resources =
    categories.find((category) => category.title === 'resources')?.items ?? [];

  return (
    <nav aria-label={t('common.main_navigation')} className="flex items-center">
      <NavDropdown
        label={t('common.products')}
        panelClassName="w-[46rem] max-w-[calc(100vw-3rem)]"
      >
        <div className="grid gap-x-3 gap-y-7 p-6 sm:grid-cols-3">
          {MARKETING_PRODUCT_GROUPS.map((group) => (
            <div key={group.key}>
              <div className="mb-3 flex items-center gap-2 px-2">
                <span className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.2em]">
                  {t(`marketing-nav.groups.${group.key}` as never)}
                </span>
                <span
                  aria-hidden
                  className="h-px flex-1 bg-gradient-to-r from-foreground/15 to-transparent"
                />
              </div>
              <div className="grid">
                {group.items.map((product) => {
                  const Icon = productIcons[product.key];
                  return (
                    <a
                      className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors duration-200 hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      href={product.href}
                      key={product.key}
                    >
                      {Icon ? (
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.04] transition-all duration-200 group-hover:scale-105 group-hover:border-foreground/20',
                            product.accent
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                      <span className="min-w-0 pt-0.5">
                        <span className="block font-medium text-sm leading-none">
                          {t(
                            `marketing-nav.products.${product.key}.label` as never
                          )}
                        </span>
                        <span className="mt-1.5 block text-foreground/45 text-xs leading-snug">
                          {t(
                            `marketing-nav.products.${product.key}.description` as never
                          )}
                        </span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <a
          className="group flex items-center justify-between gap-2 border-foreground/10 border-t bg-foreground/[0.03] px-6 py-4 font-mono-ui text-[0.68rem] uppercase tracking-[0.16em] transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          href="https://apps.tuturuuu.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          <span>{t('marketing-nav.all_apps')}</span>
          <ArrowRight className="h-4 w-4 text-foreground/40 transition-transform duration-300 group-hover:translate-x-1" />
        </a>
      </NavDropdown>

      <NavDropdown
        label={t('common.resources')}
        panelClassName="w-[34rem] max-w-[calc(100vw-3rem)]"
      >
        <div className="grid gap-1 p-4 sm:grid-cols-2">
          {resources.map((resource) => (
            <a
              className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={resource.href}
              key={resource.href}
              {...(resource.external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              <span className="mt-0.5 shrink-0 text-foreground/50 transition-colors group-hover:text-foreground/80">
                {resource.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-sm leading-none">
                  {resource.label}
                </span>
                <span className="mt-1 line-clamp-2 block text-foreground/50 text-xs leading-snug">
                  {resource.description}
                </span>
              </span>
            </a>
          ))}
        </div>
      </NavDropdown>

      <a className={linkClassName} href="/?hash-nav=1#pricing">
        {t('common.pricing')}
      </a>
      {/* Secondary links fold into the mobile sheet on narrow desktops */}
      <a className={cn(linkClassName, 'hidden lg:inline-flex')} href="/about">
        {t('common.about')}
      </a>
      <a className={cn(linkClassName, 'hidden lg:inline-flex')} href="/contact">
        {t('common.contact')}
      </a>
    </nav>
  );
}
