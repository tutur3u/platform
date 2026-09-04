import { Search } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type {
  LaunchableApp,
  LaunchableAppCategory,
} from '@tuturuuu/utils/launchable-apps';
import { LAUNCHABLE_APP_CATEGORIES } from '@tuturuuu/utils/launchable-apps';
import type { KeyboardEvent } from 'react';
import {
  APP_LAUNCHER_CATEGORY_TONES,
  AppLauncherItem,
} from './apps-launcher-item';
import { AppsLauncherKeyboardHints } from './apps-launcher-keyboard-hints';

export type AppOpenMode = 'current-tab' | 'new-tab';

export function AppsLauncherCatalog({
  apps,
  activeAppSlug,
  appsCountLabel,
  emptyDescription,
  emptyTitle,
  getAppDescription,
  getAppTitle,
  getAppUrl,
  getCategoryLabel,
  navigateLabel,
  onActiveAppChange,
  onAppKeyDown,
  onOpen,
  openMode,
  selectLabel,
}: {
  apps: readonly LaunchableApp[];
  activeAppSlug?: string;
  appsCountLabel: string;
  emptyDescription: string;
  emptyTitle: string;
  getAppDescription: (app: LaunchableApp) => string;
  getAppTitle: (app: LaunchableApp) => string;
  getAppUrl: (app: LaunchableApp) => string;
  getCategoryLabel: (category: LaunchableAppCategory) => string;
  navigateLabel: string;
  onActiveAppChange: (app: LaunchableApp) => void;
  onAppKeyDown: (
    event: KeyboardEvent<HTMLAnchorElement>,
    app: LaunchableApp
  ) => void;
  onOpen: () => void;
  openMode: AppOpenMode;
  selectLabel: string;
}) {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-slot="apps-launcher-panel"
    >
      <div
        className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"
        data-slot="apps-launcher-scroll"
        id="apps-launcher-results"
      >
        {apps.length === 0 ? (
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
              const categoryApps = apps.filter(
                (app) => app.category === category
              );

              if (categoryApps.length === 0) return null;

              return (
                <AppCategorySection
                  apps={categoryApps}
                  activeAppSlug={activeAppSlug}
                  category={category}
                  getAppDescription={getAppDescription}
                  getAppTitle={getAppTitle}
                  getAppUrl={getAppUrl}
                  key={category}
                  label={getCategoryLabel(category)}
                  onActiveAppChange={onActiveAppChange}
                  onAppKeyDown={onAppKeyDown}
                  onOpen={onOpen}
                  openMode={openMode}
                />
              );
            })}
          </div>
        )}
      </div>
      {apps.length > 0 ? (
        <AppsLauncherKeyboardHints
          appsCountLabel={appsCountLabel}
          navigateLabel={navigateLabel}
          selectLabel={selectLabel}
        />
      ) : null}
    </div>
  );
}

function AppCategorySection({
  apps,
  activeAppSlug,
  category,
  getAppDescription,
  getAppTitle,
  getAppUrl,
  label,
  onActiveAppChange,
  onAppKeyDown,
  onOpen,
  openMode,
}: {
  apps: readonly LaunchableApp[];
  activeAppSlug?: string;
  category: LaunchableAppCategory;
  getAppDescription: (app: LaunchableApp) => string;
  getAppTitle: (app: LaunchableApp) => string;
  getAppUrl: (app: LaunchableApp) => string;
  label: string;
  onActiveAppChange: (app: LaunchableApp) => void;
  onAppKeyDown: (
    event: KeyboardEvent<HTMLAnchorElement>,
    app: LaunchableApp
  ) => void;
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
            isActive={activeAppSlug === app.slug}
            key={app.slug}
            onFocus={() => onActiveAppChange(app)}
            onKeyDown={(event) => onAppKeyDown(event, app)}
            onOpen={onOpen}
            openMode={openMode}
            title={getAppTitle(app)}
          />
        ))}
      </div>
    </section>
  );
}
