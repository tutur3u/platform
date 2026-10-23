'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  CalendarDays,
  CreditCard,
  Keyboard,
  Paintbrush,
  PanelLeft,
  ReceiptText,
} from '@tuturuuu/icons';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import {
  createAccountSettingsNavGroup,
  SatelliteAccountSettingsPanel,
} from '@tuturuuu/satellite/account-settings';
import {
  createWorkspaceSettingsNavGroup,
  SatelliteWorkspaceSettingsPanel,
  SettingsWorkspaceBreadcrumb,
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
import { PaymentSettingsPanel } from '@/components/operator/payment-settings-panel';
import { InventoryCurrencySettings } from '@/components/settings/currency-settings';
import { InventorySalesDefaultsSettings } from '@/components/settings/sales-defaults-settings';
import { useSidebar } from '@/context/sidebar-context';

interface SettingsDialogProps {
  wsId?: string;
  user: WorkspaceUser | null;
  centralUrl: string;
  defaultTab?: string;
}

export function SettingsDialog({
  wsId,
  user,
  centralUrl,
  defaultTab = 'inventory_general',
}: SettingsDialogProps) {
  const t = useTranslations();
  const paymentProvider =
    defaultTab === 'inventory_square' ? 'square' : 'polar';
  const [activeTab, setActiveTab] = useState(
    defaultTab === 'inventory_polar' || defaultTab === 'inventory_square'
      ? 'inventory_payments'
      : defaultTab
  );
  const { value: expandAllAccordions } = useUserBooleanConfig(
    'EXPAND_SETTINGS_ACCORDIONS',
    true
  );

  const { data: workspace } = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      if (!wsId) throw new Error('No workspace ID');
      return getWorkspace(wsId);
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  const inventoryLabel = t('settings.inventory.title');
  const navItems = [
    {
      label: inventoryLabel,
      items: [
        {
          name: 'inventory_general',
          label: t('settings.inventory.general'),
          icon: Boxes,
          description: t('settings.inventory.general_description'),
          keywords: ['Inventory', 'Catalog', 'Stock', 'Storefront'],
        },
        {
          name: 'inventory_payments',
          label: t('settings.inventory.payments'),
          icon: CreditCard,
          description: t('settings.inventory.payments_description'),
          keywords: [
            'Payments',
            'Polar',
            'Square',
            'Terminal',
            'POS',
            'Checkout',
          ],
        },
        {
          name: 'inventory_sales',
          label: t('settings.inventory.sales'),
          icon: ReceiptText,
          description: t('settings.inventory.sales_description'),
          keywords: ['Sales', 'Wallet', 'Revenue', 'Category', 'Period'],
        },
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
    createAccountSettingsNavGroup(t),
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
      activeGroupBreadcrumb={
        wsId && activeTab.startsWith('workspace_') ? (
          <SettingsWorkspaceBreadcrumb
            activeTab={activeTab}
            appId="inventory"
            wsId={wsId}
          />
        ) : undefined
      }
      navItems={navItems}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      primaryGroupLabels={[inventoryLabel]}
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

      {activeTab === 'inventory_general' && workspace && (
        <div className="h-full">
          <div className="grid gap-6">
            <SettingItemTab
              title={t('settings.inventory.workspace_name')}
              description={t('settings.inventory.workspace_name_description')}
            >
              <span className="text-muted-foreground text-sm">
                {workspace.name || t('common.unnamed')}
              </span>
            </SettingItemTab>
            {wsId && (
              <SettingItemTab
                title={t('settings.inventory.currency_title')}
                description={t('settings.inventory.currency_description')}
              >
                <InventoryCurrencySettings wsId={wsId} />
              </SettingItemTab>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inventory_payments' && wsId && (
        <div className="h-full">
          <PaymentSettingsPanel defaultProvider={paymentProvider} wsId={wsId} />
        </div>
      )}

      {activeTab === 'inventory_sales' && wsId && (
        <div className="h-full">
          <InventorySalesDefaultsSettings wsId={wsId} />
        </div>
      )}

      <SatelliteAccountSettingsPanel
        activeTab={activeTab}
        centralUrl={centralUrl}
        user={user}
      />

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
