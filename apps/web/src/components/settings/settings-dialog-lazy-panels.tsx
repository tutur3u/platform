'use client';

import type { CalendarConnection, Workspace } from '@tuturuuu/types';
import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';
import { lazy, Suspense } from 'react';

const LazyCalendarConnectionsUnified = lazy(
  () =>
    import('@tuturuuu/ui/calendar-app/components/calendar-connections-unified')
);
const LazyLunarCalendarSettings = lazy(() =>
  import('@tuturuuu/ui/custom/settings/lunar-calendar-settings').then(
    (module) => ({ default: module.LunarCalendarSettings })
  )
);
const LazyCalendarSyncProvider = lazy(() =>
  import('@tuturuuu/ui/hooks/use-calendar-sync').then((module) => ({
    default: module.CalendarSyncProvider,
  }))
);
const LazyCalendarSettingsContent = lazy(() =>
  import('./calendar/calendar-settings-content').then((module) => ({
    default: module.CalendarSettingsContent,
  }))
);
const LazyCalendarSettingsLayout = lazy(() =>
  import('./calendar/calendar-settings-layout').then((module) => ({
    default: module.CalendarSettingsLayout,
  }))
);
const LazyCalendarSettingsWrapper = lazy(() =>
  import('./calendar/calendar-settings-wrapper').then((module) => ({
    default: module.CalendarSettingsWrapper,
  }))
);

const LazyApprovalsSettings = lazy(() =>
  import('./approvals/approvals-settings').then((module) => ({
    default: module.ApprovalsSettings,
  }))
);
const LazyAttendanceDisplaySettings = lazy(
  () => import('./attendance/attendance-display-settings')
);
const LazyDatabaseDefaultFiltersSettings = lazy(() =>
  import('./users/database-default-filters-settings').then((module) => ({
    default: module.DatabaseDefaultFiltersSettings,
  }))
);
const LazyFeaturedGroupsSettings = lazy(
  () => import('./users/featured-groups-settings')
);
const LazyRequireAttentionColorSettings = lazy(() =>
  import('./users/require-attention-color-settings').then((module) => ({
    default: module.RequireAttentionColorSettings,
  }))
);
const LazyUsersManagementSettings = lazy(
  () => import('./users/users-management-settings')
);

const LazyDebtLoanSettings = lazy(() => import('./finance/debt-loan-settings'));
const LazyDefaultCurrencySettings = lazy(
  () => import('./finance/default-currency-settings')
);
const LazyExperimentalFinanceSettings = lazy(
  () => import('./finance/experimental-finance-settings')
);
const LazyFinanceNavigationSettings = lazy(
  () => import('./finance/finance-navigation-settings')
);
const LazyInvoiceSettings = lazy(() => import('./finance/invoice-settings'));
const LazyInvoiceVisibilitySettings = lazy(
  () => import('./finance/invoice-visibility-settings')
);
const LazyTransactionDefaultsSettings = lazy(
  () => import('./finance/transaction-defaults-settings')
);

const LazyMiraMemorySettings = lazy(() =>
  import('./mira/mira-memory-settings').then((module) => ({
    default: module.MiraMemorySettings,
  }))
);
const LazyMiraPersonalitySettings = lazy(() =>
  import('./mira/mira-personality-settings').then((module) => ({
    default: module.MiraPersonalitySettings,
  }))
);

const LazyReportDefaultTitleSettings = lazy(() =>
  import('./reports/report-default-title-settings').then((module) => ({
    default: module.ReportDefaultTitleSettings,
  }))
);

const LazyTimeTrackerCategoriesSettings = lazy(() =>
  import('./time-tracker/time-tracker-categories-settings').then((module) => ({
    default: module.TimeTrackerCategoriesSettings,
  }))
);
const LazyTimeTrackerGeneralSettings = lazy(() =>
  import('./time-tracker/time-tracker-general-settings').then((module) => ({
    default: module.TimeTrackerGeneralSettings,
  }))
);
const LazyTimeTrackerGoalsSettings = lazy(() =>
  import('./time-tracker/time-tracker-goals-settings').then((module) => ({
    default: module.TimeTrackerGoalsSettings,
  }))
);
const LazyTimeTrackerRequestsSettings = lazy(() =>
  import('./time-tracker/time-tracker-requests-settings').then((module) => ({
    default: module.TimeTrackerRequestsSettings,
  }))
);
const LazyWorkspaceBreakTypesSettings = lazy(() =>
  import('./time-tracker/workspace-break-types-settings').then((module) => ({
    default: module.WorkspaceBreakTypesSettings,
  }))
);

function SettingsPanelFallback() {
  return (
    <div className="space-y-4 py-1">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-md bg-muted" />
      <div className="h-20 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

function PanelSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SettingsPanelFallback />}>{children}</Suspense>;
}

function withPanelSuspense<P extends object>(
  Component: LazyExoticComponent<ComponentType<P>>
) {
  return function LazySettingsPanel(props: P) {
    return (
      <PanelSuspense>
        <Component {...props} />
      </PanelSuspense>
    );
  };
}

function getInitialCalendarSettings(workspace: Workspace | null) {
  if (!workspace) return undefined;

  return {
    timezone: {
      timezone: workspace.timezone || 'auto',
      showSecondaryTimezone: false,
    },
  };
}

interface CalendarBasePanelProps {
  description: string;
  title: string;
  workspace: Workspace | null;
  wsId?: string;
}

export function CalendarGeneralSettingsPanel({
  description,
  title,
  workspace,
  wsId,
}: CalendarBasePanelProps) {
  return (
    <PanelSuspense>
      <LazyCalendarSettingsWrapper
        wsId={wsId}
        initialSettings={getInitialCalendarSettings(workspace)}
      >
        <div className="h-full">
          <LazyCalendarSettingsLayout
            title={title}
            description={description}
            hideActions
          >
            <LazyLunarCalendarSettings />
          </LazyCalendarSettingsLayout>
        </div>
      </LazyCalendarSettingsWrapper>
    </PanelSuspense>
  );
}

interface CalendarIntegrationsSettingsPanelProps
  extends CalendarBasePanelProps {
  calendarConnections: CalendarConnection[];
  wsId: string;
}

export function CalendarIntegrationsSettingsPanel({
  calendarConnections,
  description,
  title,
  workspace,
  wsId,
}: CalendarIntegrationsSettingsPanelProps) {
  return (
    <PanelSuspense>
      <LazyCalendarSettingsWrapper
        wsId={wsId}
        initialSettings={getInitialCalendarSettings(workspace)}
      >
        <LazyCalendarSyncProvider
          wsId={wsId}
          initialCalendarConnections={calendarConnections}
        >
          <div className="h-full">
            <LazyCalendarSettingsLayout
              title={title}
              description={description}
              hideActions
            >
              <LazyCalendarConnectionsUnified wsId={wsId} variant="settings" />
            </LazyCalendarSettingsLayout>
          </div>
        </LazyCalendarSyncProvider>
      </LazyCalendarSettingsWrapper>
    </PanelSuspense>
  );
}

interface CalendarContentSettingsPanelProps {
  section: 'calendar_hours' | 'calendar_colors';
  workspace: Workspace | null;
  wsId: string;
}

export function CalendarContentSettingsPanel({
  section,
  workspace,
  wsId,
}: CalendarContentSettingsPanelProps) {
  return (
    <PanelSuspense>
      <LazyCalendarSettingsWrapper
        wsId={wsId}
        initialSettings={getInitialCalendarSettings(workspace)}
      >
        <LazyCalendarSettingsContent
          section={section}
          wsId={wsId}
          workspace={workspace}
        />
      </LazyCalendarSettingsWrapper>
    </PanelSuspense>
  );
}

export const ApprovalsSettings = withPanelSuspense(LazyApprovalsSettings);
export const AttendanceDisplaySettings = withPanelSuspense(
  LazyAttendanceDisplaySettings
);
export const DatabaseDefaultFiltersSettings = withPanelSuspense(
  LazyDatabaseDefaultFiltersSettings
);
export const DebtLoanSettings = withPanelSuspense(LazyDebtLoanSettings);
export const DefaultCurrencySettings = withPanelSuspense(
  LazyDefaultCurrencySettings
);
export const ExperimentalFinanceSettings = withPanelSuspense(
  LazyExperimentalFinanceSettings
);
export const FeaturedGroupsSettings = withPanelSuspense(
  LazyFeaturedGroupsSettings
);
export const FinanceNavigationSettings = withPanelSuspense(
  LazyFinanceNavigationSettings
);
export const InvoiceSettings = withPanelSuspense(LazyInvoiceSettings);
export const InvoiceVisibilitySettings = withPanelSuspense(
  LazyInvoiceVisibilitySettings
);
export const MiraMemorySettings = withPanelSuspense(LazyMiraMemorySettings);
export const MiraPersonalitySettings = withPanelSuspense(
  LazyMiraPersonalitySettings
);
export const ReportDefaultTitleSettings = withPanelSuspense(
  LazyReportDefaultTitleSettings
);
export const RequireAttentionColorSettings = withPanelSuspense(
  LazyRequireAttentionColorSettings
);
export const TimeTrackerCategoriesSettings = withPanelSuspense(
  LazyTimeTrackerCategoriesSettings
);
export const TimeTrackerGeneralSettings = withPanelSuspense(
  LazyTimeTrackerGeneralSettings
);
export const TimeTrackerGoalsSettings = withPanelSuspense(
  LazyTimeTrackerGoalsSettings
);
export const TimeTrackerRequestsSettings = withPanelSuspense(
  LazyTimeTrackerRequestsSettings
);
export const TransactionDefaultsSettings = withPanelSuspense(
  LazyTransactionDefaultsSettings
);
export const UsersManagementSettings = withPanelSuspense(
  LazyUsersManagementSettings
);
export const WorkspaceBreakTypesSettings = withPanelSuspense(
  LazyWorkspaceBreakTypesSettings
);
