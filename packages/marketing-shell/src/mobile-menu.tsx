'use client';

import { MenuIcon } from '@tuturuuu/icons/lucide-static';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import type { MarketingLocale, Translate } from './i18n';
import { type NavItem, navigation } from './navigation';
import { MARKETING_PRODUCT_GROUPS } from './products';

const rowClass =
  'rounded-lg px-4 py-2.5 text-sm transition-all hover:bg-accent active:bg-accent/80';

/** Mobile navigation sheet (ported from apps/marketing). */
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
  const { categories } = navigation(t);
  const main = categories.find((c) => c.title === 'main')?.items ?? [];
  const resources =
    categories.find((c) => c.title === 'resources')?.items ?? [];
  const site = (href: string) =>
    href.startsWith('/') ? `${siteUrl}${href}` : href;
  const link = (item: NavItem, className: string) => (
    <a
      className={cn(
        'transition-opacity duration-200',
        pathname === item.href ? 'opacity-100' : 'opacity-60 hover:opacity-100',
        className
      )}
      href={site(item.href)}
      key={item.href}
      onClick={close}
      {...(item.external
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
    >
      <span className="flex items-center gap-2">
        {item.icon}
        {item.label}
      </span>
    </a>
  );
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t('common.main_navigation')}
        className="rounded-lg p-2 transition-all hover:bg-accent active:bg-accent/80"
      >
        <MenuIcon className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="max-h-dvh w-full gap-0 border-l p-0 md:hidden"
      >
        <SheetTitle className="sr-only">
          {t('common.main_navigation')}
        </SheetTitle>
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b px-6 py-6">
            <a
              className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-foreground px-4 font-medium text-background text-sm"
              href={signInHref}
              onClick={close}
            >
              {t('common.get-started')}
            </a>
            {onLocaleChange ? (
              <button
                className="h-10 rounded-lg border px-3 font-medium text-sm uppercase"
                onClick={() => onLocaleChange(locale === 'en' ? 'vi' : 'en')}
                type="button"
              >
                {locale === 'en' ? 'vi' : 'en'}
              </button>
            ) : null}
            <ThemeToggle forceDisplay />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col py-6">
              <div className="mb-4 grid gap-2 px-4 font-medium">
                {main.map((item) => link(item, rowClass))}
              </div>
              <Accordion type="multiple" className="space-y-3">
                <AccordionItem value="products" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent data-[state=open]:bg-accent/50">
                    <span className="font-mono-ui text-[0.68rem] uppercase tracking-[0.18em]">
                      {t('common.products')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-2">
                    <div className="grid gap-4 px-2">
                      {MARKETING_PRODUCT_GROUPS.map((group) => (
                        <div key={group.key}>
                          <div className="mb-1 px-4 font-mono-ui text-[0.58rem] text-foreground/35 uppercase tracking-[0.2em]">
                            {t(`marketing-nav.groups.${group.key}`)}
                          </div>
                          {group.items.map((product) =>
                            link(
                              {
                                href: product.href,
                                label: t(
                                  `marketing-nav.products.${product.key}.label`
                                ),
                              },
                              rowClass
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="resources" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent data-[state=open]:bg-accent/50">
                    <span className="font-mono-ui text-[0.68rem] uppercase tracking-[0.18em]">
                      {t('common.resources')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-2">
                    <div className="grid gap-2 px-2">
                      {resources.map((item) => link(item, rowClass))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
