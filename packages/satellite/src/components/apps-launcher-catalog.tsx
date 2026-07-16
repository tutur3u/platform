import { Search } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type {
  LaunchableApp,
  LaunchableAppCategory,
} from '@tuturuuu/utils/launchable-apps';
import { LAUNCHABLE_APP_CATEGORIES } from '@tuturuuu/utils/launchable-apps';
import {
  APP_LAUNCHER_CATEGORY_TONES,
  AppLauncherItem,
} from './apps-launcher-item';

export type AppOpenMode = 'current-tab' | 'new-tab';

export function AppsLauncherCatalog({
  apps,
  emptyDescription,
  emptyTitle,
  getAppDescription,
  getAppTitle,
  getAppUrl,
  getCategoryLabel,
  onOpen,
  openMode,
  query,
}: {
  apps: readonly LaunchableApp[];
  emptyDescription: string;
  emptyTitle: string;
  getAppDescription: (app: LaunchableApp) => string;
  getAppTitle: (app: LaunchableApp) => string;
  getAppUrl: (app: LaunchableApp) => string;
  getCategoryLabel: (category: LaunchableAppCategory) => string;
  onOpen: () => void;
  openMode: AppOpenMode;
  query: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleApps = normalizedQuery
    ? apps.filter((app) => {
        const searchText = [
          app.slug,
          getAppTitle(app),
          getAppDescription(app),
          ...app.aliases,
        ]
          .join(' ')
          .toLocaleLowerCase();

        return searchText.includes(normalizedQuery);
      })
    : apps;

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-slot="apps-launcher-panel"
    >
      <div
        className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"
        data-slot="apps-launcher-scroll"
      >
        {visibleApps.length === 0 ? (
          <div
            aria-live="polite"
            className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center"
            data-slot="apps-launcher-empty"
          >
            <span className="mb-3 flex size-10 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
              <Search aria-hidden="true" className="size-4" />
            </span>
            <p className="font-semibold text-sm">{emptyTitle}</p>
            <p className="mt-1 max-w-xs text-muted-foreground text-xs leading-relaxed">
              {emptyDescription}
            </p>
          </div>
        ) : (
          <div className="w-full space-y-4" data-slot="apps-launcher-sections">
            {LAUNCHABLE_APP_CATEGORIES.map((category) => {
              const categoryApps = visibleApps.filter(
                (app) => app.category === category
              );

              if (categoryApps.length === 0) return null;

              return (
                <AppCategorySection
                  apps={categoryApps}
                  category={category}
                  getAppDescription={getAppDescription}
                  getAppTitle={getAppTitle}
                  getAppUrl={getAppUrl}
                  key={category}
                  label={getCategoryLabel(category)}
                  onOpen={onOpen}
                  openMode={openMode}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AppCategorySection({
  apps,
  category,
  getAppDescription,
  getAppTitle,
  getAppUrl,
  label,
  onOpen,
  openMode,
}: {
  apps: readonly LaunchableApp[];
  category: LaunchableAppCategory;
  getAppDescription: (app: LaunchableApp) => string;
  getAppTitle: (app: LaunchableApp) => string;
  getAppUrl: (app: LaunchableApp) => string;
  label: string;
  onOpen: () => void;
  openMode: AppOpenMode;
}) {
  const headingId = `apps-launcher-section-${category}`;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full"
      data-slot="apps-launcher-section"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full',
            APP_LAUNCHER_CATEGORY_TONES[category].dot
          )}
        />
        <h3
          className="font-medium text-muted-foreground text-xs"
          id={headingId}
        >
          {label}
        </h3>
      </div>
      <div
        className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-slot="apps-launcher-grid"
      >
        {apps.map((app) => (
          <AppLauncherItem
            app={app}
            description={getAppDescription(app)}
            getAppUrl={getAppUrl}
            key={app.slug}
            onOpen={onOpen}
            openMode={openMode}
            title={getAppTitle(app)}
          />
        ))}
      </div>
    </section>
  );
}
