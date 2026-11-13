import type { ComponentProps, ComponentType, ReactNode } from 'react';
import type { MarketingLocale, Translate } from './i18n';

export type ShellLink = ComponentType<ComponentProps<'a'> & { href: string }>;
export type ShellImage = ComponentType<ComponentProps<'img'> & { src: string }>;

/**
 * Everything framework-specific comes in as props, so Next (apps/web,
 * apps/marketing) and TanStack Start (apps/roadmap) render the same layout.
 */
export interface MarketingShellProps {
  children: ReactNode;
  /** Server-rendered hosts provide a small client controls island. */
  actions?: ReactNode;
  brandHref?: string;
  t: Translate;
  locale: MarketingLocale;
  /** Switch language; Next sets its locale cookie, the roadmap swaps state. */
  onLocaleChange?: (locale: MarketingLocale) => void;
  /** Current path, for active links and the /login special case. */
  pathname: string;
  /** Sign-in / get-started destination. */
  signInHref?: string;
  /** Logo image URL served by the host app (its own origin or mount). */
  logoSrc: string;
  LinkComponent?: ShellLink;
  ImageComponent?: ShellImage;
  /** Base for footer links; defaults to https://tuturuuu.com. */
  siteUrl?: string;
  /**
   * Shrink the floating pill so a page can dock its own bar underneath.
   * Off by default: other marketing pages keep the full pill.
   */
  navCompact?: boolean;
}
