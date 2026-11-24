/**
 * Community links shown in every app's account menu, footer and help menus.
 * Discord is hidden across all apps; flip `discord` to show it again. Docs
 * links are not governed here.
 */
export const COMMUNITY_LINKS = { discord: false } as const;

/** The Discord invite to show, or undefined while Discord links are hidden. */
export function visibleDiscordHref(href: string | undefined) {
  return COMMUNITY_LINKS.discord && href ? href : undefined;
}
