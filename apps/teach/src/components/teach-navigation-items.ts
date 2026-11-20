import type { CommandLauncherNavItem } from '@tuturuuu/satellite/command-launcher';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';

export function teachNavigationItems(links: readonly (NavLink | null)[]) {
  const items = new Map<string, CommandLauncherNavItem>();
  function add(entries: readonly (NavLink | null)[], group?: string) {
    for (const entry of entries) {
      if (!entry || entry.disabled || entry.tempDisabled) continue;
      if (entry.href && !items.has(entry.href)) {
        items.set(entry.href, {
          aliases: entry.aliases,
          external: entry.external,
          group,
          href: entry.href,
          icon: entry.icon,
          title: entry.title,
        });
      }
      if (entry.children) add(entry.children, entry.title);
    }
  }
  add(links);
  return Array.from(items.values());
}
