'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Coins,
  Compass,
  CreditCard,
  DollarSign,
  FileText,
  FlaskConical,
  HandCoins,
  Keyboard,
  LayoutGrid,
  Paintbrush,
  PanelLeft,
  User,
} from '@tuturuuu/icons';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import {
  createWorkspaceSettingsNavGroup,
  SatelliteWorkspaceSettingsPanel,
} from '@tuturuuu/satellite/workspace-settings';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import { KeyboardShortcutsSettings } from '@tuturuuu/ui/custom/settings/keyboard-shortcuts-settings';
import { LunarCalendarSettings } from '@tuturuuu/ui/custom/settings/lunar-calendar-settings';
import SharedSidebarSettings from '@tuturuuu/ui/custom/settings/sidebar-settings';
import { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSidebar } from '@/context/sidebar-context';
import DebtLoanSettings from './finance/debt-loan-settings';
import DefaultCurrencySettings from './finance/default-currency-settings';
import ExperimentalFinanceSettings from './finance/experimental-finance-settings';
import FinanceNavigationSettings from './finance/finance-navigation-settings';
import InvoiceSettings from './finance/invoice-settings';
import InvoiceVisibilitySettings from './finance/invoice-visibility-settings';
import TransactionDefaultsSettings from './finance/transaction-defaults-settings';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  defaultTab?: string;
}

export function SettingsDialog({
  wsId,
  user,
  defaultTab = 'finance_general',
}: SettingsDialogProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState(defaultTab);

  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  // Fetch workspace for settings
  const { data: workspace } = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      if (!wsId) throw new Error('No workspace ID');
      return getWorkspace(wsId);
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  // Finance is the primary group — expanded by default, listed first.
  const financeLabel = t('settings.finance.title');

  const navItems = [
    {
      label: financeLabel,
      items: [
        {
          name: 'finance_general',
          label: t('settings.finance.general'),
          icon: DollarSign,
          description: t('settings.finance.general_description'),
          keywords: ['Finance', 'General', 'Currency'],
        },
        ...(wsId
          ? [
              {
                name: 'finance_navigation',
                label: t('settings.finance.navigation'),
                icon: Compass,
                description: t('settings.finance.navigation_description'),
                keywords: ['Finance', 'Navigation', 'Menu'],
              },
              {
                name: 'invoice_visibility',
                label: t('settings.finance.invoice_visibility'),
                icon: FileText,
                description: t(
                  'settings.finance.invoice_visibility_description'
                ),
                keywords: ['Finance', 'Invoice', 'Visibility'],
              },
              {
                name: 'transaction_defaults',
                label: t('settings.finance.transaction_defaults'),
                icon: LayoutGrid,
                description: t(
                  'settings.finance.transaction_defaults_description'
                ),
                keywords: ['Finance', 'Transaction', 'Defaults', 'Wallet'],
              },
              {
                name: 'default_currency',
                label: t('settings.finance.default_currency'),
                icon: Coins,
                description: t('settings.finance.default_currency_description'),
                keywords: ['Finance', 'Currency'],
              },
              {
                name: 'invoice_settings',
                label: t('settings.finance.invoice_settings'),
                icon: CreditCard,
                description: t('settings.finance.invoice_settings_description'),
                keywords: ['Finance', 'Invoice', 'Settings'],
              },
              {
                name: 'debt_loan_categories',
                label: t('settings.finance.debt_loan_categories'),
                icon: HandCoins,
                description: t(
                  'settings.finance.debt_loan_categories_description'
                ),
                keywords: ['Finance', 'Debt', 'Loan', 'Categories'],
              },
              {
                name: 'experimental_finance',
                label: t('ws-finance-settings.experimental_title'),
                icon: FlaskConical,
                description: t('ws-finance-settings.experimental_description'),
                keywords: ['Finance', 'Experimental'],
              },
            ]
          : []),
      ],
    },
    {
      label: t('settings.calendar.title'),
      items: [
        {
          name: 'calendar_general',
          label: t('settings.calendar.general'),
          icon: CalendarDays,
          description: t('settings.calendar.general_description'),
          keywords: ['Calendar', 'General', 'Lunar'],
        },
      ],
    },
    ...(wsId ? [createWorkspaceSettingsNavGroup(t)] : []),
    {
      label: t('settings.user.title'),
      items: [
        {
          name: 'profile',
          label: t('settings.user.profile'),
          icon: User,
          description: t('settings.user.profile_description'),
          keywords: ['Profile'],
        },
      ],
    },
    {
      label: t('settings.preferences.title'),
      items: [
        {
          name: 'appearance',
          label: t('settings.preferences.appearance'),
          icon: Paintbrush,
          description: t('settings-account.appearance-description'),
          keywords: ['Appearance', 'Theme'],
        },
        {
          name: 'sidebar',
          label: t('settings.preferences.sidebar'),
          icon: PanelLeft,
          description: t('settings.preferences.sidebar_description'),
          keywords: ['Sidebar', 'Navigation', 'Menu'],
        },
        {
          name: 'keyboard_shortcuts',
          label: t('settings.preferences.keyboard_shortcuts'),
          icon: Keyboard,
          description: t('settings.preferences.keyboard_shortcuts_description'),
          keywords: ['Keyboard', 'Shortcuts', 'Hotkeys'],
        },
      ],
    },
  ];

  return (
    <SettingsDialogShell
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      primaryGroupLabels={[financeLabel]}
      expandAllAccordions={expandAllAccordions}
      keyboardNavigation
    >
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        workspace={workspace ?? null}
        wsId={wsId}
      />
      {activeTab === 'calendar_general' && (
        <div className="h-full">
          <LunarCalendarSettings />
        </div>
      )}

      {activeTab === 'finance_general' && workspace && (
        <div className="h-full">
          <div className="space-y-8">
            <div className="grid gap-6">
              <SettingItemTab
                title={t('settings.finance.workspace_name')}
                description={t('settings.finance.workspace_name_description')}
              >
                <span className="text-muted-foreground text-sm">
                  {workspace.name || t('common.unnamed')}
                </span>
              </SettingItemTab>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'finance_navigation' && workspace?.id && (
        <FinanceNavigationSettings workspaceId={workspace.id} />
      )}

      {activeTab === 'invoice_visibility' && workspace?.id && (
        <InvoiceVisibilitySettings
          workspaceId={workspace.id}
          isPersonalWorkspace={workspace.personal}
        />
      )}

      {activeTab === 'transaction_defaults' && workspace?.id && (
        <TransactionDefaultsSettings workspaceId={workspace.id} user={user} />
      )}

      {activeTab === 'default_currency' && workspace?.id && (
        <DefaultCurrencySettings workspaceId={workspace.id} />
      )}

      {activeTab === 'invoice_settings' && workspace?.id && (
        <InvoiceSettings workspaceId={workspace.id} />
      )}

      {activeTab === 'debt_loan_categories' && workspace?.id && (
        <DebtLoanSettings workspaceId={workspace.id} />
      )}

      {activeTab === 'experimental_finance' && workspace?.id && (
        <ExperimentalFinanceSettings workspaceId={workspace.id} />
      )}

      {activeTab === 'profile' && user && (
        <div className="space-y-8">
          <div className="grid gap-6">
            <SettingItemTab
              title={t('settings-account.display-name')}
              description={t('settings-account.display-name-description')}
            >
              <span className="text-muted-foreground text-sm">
                {user?.display_name || t('common.unnamed')}
              </span>
            </SettingItemTab>
            <SettingItemTab
              title="Email"
              description={t('settings-account.email-description')}
            >
              <span className="text-muted-foreground text-sm">
                {user?.email || '—'}
              </span>
            </SettingItemTab>
          </div>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="h-full">
          <AppearanceSettings
            canManageVersionBadge={isExactTuturuuuDotComEmail(user?.email)}
          />
        </div>
      )}

      {activeTab === 'sidebar' && (
        <div className="h-full">
          <SharedSidebarSettings useSidebar={useSidebar} />
        </div>
      )}

      {activeTab === 'keyboard_shortcuts' && (
        <div className="h-full">
          <KeyboardShortcutsSettings />
        </div>
      )}
    </SettingsDialogShell>
  );
}
