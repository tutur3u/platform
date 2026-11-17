import { Search } from '@tuturuuu/icons';
import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';
import type { ElementType } from 'react';
import { AppLauncherChip, AppLauncherRow } from './apps-launcher-item';
import type {
  AppsLauncherEntry,
  AppsLauncherSection,
} from './apps-launcher-view';

export type AppOpenMode = 'current-tab' | 'new-tab';

export const APPS_LAUNCHER_LISTBOX_ID = 'apps-launcher-results';

export type AppsLauncherCatalogProps = {
  activeEntryId?: string;
  currentSlug?: string;
  emptyLabel: string;
  favorites: readonly string[];
  getAppTitle: (app: LaunchableApp) => string;
  getAppUrl: (app: LaunchableApp) => string;
  getCategoryLabel: (app: LaunchableApp) => string;
  getFavoriteLabel: (app: LaunchableApp, isFavorite: boolean) => string;
  getSectionLabel: (section: AppsLauncherSection) => string;
  currentLabel: string;
  linkComponent?: ElementType;
  listLabel: string;
  onActiveEntryChange: (entry: AppsLauncherEntry) => void;
  onOpen: (app: LaunchableApp) => void;
  onToggleFavorite: (slug: string) => void;
  openMode: AppOpenMode;
  sections: readonly AppsLauncherSection[];
};

/**
 * The launcher listbox: Recent chips, Favorites rows and category rows, or a
 * single Results list while searching. Options are links so the open mode
 * and modifier clicks behave like any other link.
 */
export function AppsLauncherCatalog(props: AppsLauncherCatalogProps) {
  const { sections } = props;

  if (sections.length === 0) {
    return (
      <div
        aria-live="polite"
        className="flex flex-col items-center gap-3 px-6 py-10 text-center text-muted-foreground text-sm"
        data-slot="apps-launcher-empty"
      >
        <Search aria-hidden="true" className="size-4" />
        <p className="font-medium">{props.emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      aria-label={props.listLabel}
      className="flex flex-col gap-1"
      data-slot="apps-launcher-sections"
      id={APPS_LAUNCHER_LISTBOX_ID}
      role="listbox"
    >
      {sections.map((section) => (
        <CatalogSection key={section.id} {...props} section={section} />
      ))}
    </div>
  );
}

function CatalogSection({
  section,
  ...props
}: AppsLauncherCatalogProps & { section: AppsLauncherSection }) {
  const headingId = `apps-launcher-heading-${section.id}`;

  return (
    <div
      aria-labelledby={headingId}
      data-section={section.id}
      data-slot="apps-launcher-section"
      role="group"
    >
      <div
        className="px-2 pt-2.5 pb-1.5 font-semibold text-muted-foreground text-xs"
        data-slot="apps-launcher-section-heading"
        id={headingId}
      >
        {props.getSectionLabel(section)}
      </div>
      <div
        className={
          section.kind === 'chips'
            ? 'flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]'
            : 'flex flex-col'
        }
        data-slot={
          section.kind === 'chips'
            ? 'apps-launcher-chips'
            : 'apps-launcher-rows'
        }
        role="none"
      >
        {section.entries.map((entry) => {
          const optionProps = {
            entry,
            href: props.getAppUrl(entry.app),
            isActive: entry.id === props.activeEntryId,
            isCurrent: entry.app.slug === props.currentSlug,
            linkComponent: props.linkComponent,
            onActivate: () => props.onActiveEntryChange(entry),
            onOpen: () => props.onOpen(entry.app),
            openMode: props.openMode,
            title: props.getAppTitle(entry.app),
          };

          if (section.kind === 'chips') {
            return <AppLauncherChip key={entry.id} {...optionProps} />;
          }

          const isFavorite = props.favorites.includes(entry.app.slug);
          return (
            <AppLauncherRow
              key={entry.id}
              {...optionProps}
              categoryLabel={
                section.id === 'results'
                  ? props.getCategoryLabel(entry.app)
                  : undefined
              }
              currentLabel={props.currentLabel}
              favoriteLabel={props.getFavoriteLabel(entry.app, isFavorite)}
              isFavorite={isFavorite}
              onToggleFavorite={() => props.onToggleFavorite(entry.app.slug)}
            />
          );
        })}
      </div>
    </div>
  );
}
