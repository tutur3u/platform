'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect, useState } from 'react';
import type { MarketingLocale, Translate } from './i18n';
import { MobileMenuTrigger } from './mobile-menu-trigger';
import { PreferenceOptions } from './nav-preferences';
import { navPrimary } from './nav-styles';
import { type NavItem, navigation } from './navigation';
import { MARKETING_PRODUCT_GROUPS, MARKETING_PRODUCT_ICONS } from './products';

/** 44px rows: comfortable touch targets in one rhythm. */
const rowClass =
  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring';
const sectionTrigger =
  'min-h-11 items-center rounded-lg px-3 py-0 font-medium text-sm hover:bg-accent hover:no-underline data-[state=open]:bg-accent/60';

/** Mobile navigation sheet: links, product groups, preferences and the CTA. */
export function MobileMenu({
  initiallyOpen = false,
  t,
  pathname,
  siteUrl,
  signInHref,
  locale,
  onLocaleChange,
}: {
  initiallyOpen?: boolean;
  t: Translate;
  pathname: string;
  siteUrl: string;
  signInHref: string;
  locale: MarketingLocale;
  onLocaleChange?: (locale: MarketingLocale) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const close = () => setOpen(false);
  // The sheet is hidden from md up, but a modal Radix sheet would still
  // block the page. Close it when the viewport widens, including when the
  // chunk finishes loading after a resize.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      if (desktop.matches) setOpen(false);
    };
    sync();
    desktop.addEventListener('change', sync);
    return () => desktop.removeEventListener('change', sync);
  }, []);
  const { categories } = navigation(t);
  const main = categories.find((c) => c.title === 'main')?.items ?? [];
  const resources =
    categories.find((c) => c.title === 'resources')?.items ?? [];
  const site = (href: string) =>
    href.startsWith('/') ? `${siteUrl}${href}` : href;
  const link = (item: NavItem, nested = false, icon?: ReactNode) => {
    const current = pathname === item.href;
    return (
      <a
        aria-current={current ? 'page' : undefined}
        className={cn(
          rowClass,
          // Top-level links read as primary; section items are secondary.
          nested ? 'text-muted-foreground' : 'font-medium text-foreground',
          current && 'bg-accent text-accent-foreground'
        )}
        href={site(item.href)}
        key={item.href}
        onClick={close}
        {...(item.external
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
      >
        {(icon ?? item.icon) ? (
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
            {icon ?? item.icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{item.label}</span>
      </a>
    );
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <MobileMenuTrigger t={t} />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="max-h-dvh w-full gap-0 p-0 sm:max-w-sm md:hidden"
      >
        <SheetTitle className="sr-only">
          {t('common.main_navigation')}
        </SheetTitle>
        <nav
          aria-label={t('common.main_navigation')}
          // Clears the sheet's close button.
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-12 pb-3"
        >
          <div className="grid gap-0.5">{main.map((item) => link(item))}</div>
          <Accordion
            className="mt-2 grid gap-0.5 border-t pt-2"
            type="multiple"
          >
            <AccordionItem className="border-none" value="products">
              <AccordionTrigger className={sectionTrigger}>
                {t('common.products')}
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-2">
                <div className="grid gap-3">
                  {MARKETING_PRODUCT_GROUPS.map((group) => (
                    <div key={group.key}>
                      <div className="px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs">
                        {t(`marketing-nav.groups.${group.key}`)}
                      </div>
                      {group.items.map((product) => {
                        const Icon = MARKETING_PRODUCT_ICONS[product.key];
                        return link(
                          {
                            href: product.href,
                            label: t(
                              `marketing-nav.products.${product.key}.label`
                            ),
                          },
                          true,
                          Icon ? (
                            <Icon className={cn('size-4', product.accent)} />
                          ) : undefined
                        );
                      })}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem className="border-none" value="resources">
              <AccordionTrigger className={sectionTrigger}>
                {t('common.resources')}
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-2">
                <div className="grid gap-0.5">
                  {resources.map((item) => link(item, true))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </nav>
        <div className="grid shrink-0 gap-4 border-t px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <PreferenceOptions
            locale={locale}
            onLocaleChange={onLocaleChange}
            t={t}
          />
          <a
            className={cn(navPrimary, 'h-11 w-full rounded-lg')}
            href={signInHref}
            onClick={close}
          >
            {t('common.get-started')}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
