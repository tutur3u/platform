'use client';

import {
  type CommandLauncherNavItem,
  CommandCenterHost,
} from '@tuturuuu/satellite/command-center';
import { getInteractiveProducts } from '@/lib/showcase/catalog';

// Playground is English-only (see src/i18n/request.ts), so the launcher keeps
// its English labels. Demo pages are local links; no account is involved.
const PLAYGROUND_NAV_ITEMS: CommandLauncherNavItem[] = [
  { group: 'Playground', href: '/', keywords: ['home', 'showcase'], title: 'Playground' },
  ...getInteractiveProducts().map((product) => ({
    group: 'Demos',
    href: `/demo/${product.slug}`,
    keywords: ['demo', product.slug],
    subtitle: product.summary,
    title: `${product.title} demo`,
  })),
];

/**
 * Playground has no launchable slug, so it hosts the center as `external`.
 * With no signed-in actor the center lists apps and demo pages only.
 */
export function PlaygroundCommandCenter() {
  return (
    <CommandCenterHost currentApp="external" navItems={PLAYGROUND_NAV_ITEMS} />
  );
}
