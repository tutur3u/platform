import {
  CalendarDays,
  ClipboardList,
  Clock,
  Coffee,
  Coins,
  Compass,
  CreditCard,
  FileText,
  FlaskConical,
  Goal,
  HandCoins,
  LayoutGrid,
  Ticket,
} from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';

export function buildDomainSettingsNavGroups({
  t,
  wsId,
}: SettingsNavBuilderParams): SettingsNavGroup[] {
  if (!wsId) return [];

  return [
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
        {
          name: 'calendar_hours',
          label: t('settings.calendar.hours'),
          icon: Clock,
          description: t('settings.calendar.hours_description'),
          keywords: ['Calendar', 'Hours', 'Timezone'],
        },
        {
          name: 'calendar_colors',
          label: t('settings.calendar.colors'),
          icon: LayoutGrid,
          description: t('settings.calendar.colors_description'),
          keywords: ['Calendar', 'Colors', 'Categories'],
        },
        {
          name: 'calendar_integrations',
          label: t('settings.calendar.integrations'),
          icon: CalendarDays,
          description: t('settings.calendar.integrations_description'),
          keywords: ['Calendar', 'Integrations', 'Google', 'Outlook'],
        },
      ],
    },
    {
      label: t('settings.time_tracker.title'),
      items: [
        {
          name: 'time_tracker_general',
          label: t('settings.time_tracker.general'),
          icon: Clock,
          description: t('settings.time_tracker.general_description'),
          keywords: ['Time Tracker', 'General', 'Future'],
        },
        {
          name: 'time_tracker_categories',
          label: t('settings.time_tracker.categories'),
          icon: LayoutGrid,
          description: t('settings.time_tracker.categories_description'),
          keywords: ['Time Tracker', 'Categories'],
        },
        {
          name: 'time_tracker_goals',
          label: t('settings.time_tracker.goals'),
          icon: Goal,
          description: t('settings.time_tracker.goals_description'),
          keywords: ['Time Tracker', 'Goals', 'Productivity'],
        },
        {
          name: 'time_tracker_requests',
          label: t('settings.time_tracker.requests'),
          icon: ClipboardList,
          description: t('settings.time_tracker.requests_description'),
          keywords: ['Time Tracker', 'Requests', 'Threshold'],
        },
        {
          name: 'break_types',
          label: t('settings.time_tracker.break_types'),
          icon: Coffee,
          description: t('settings.time_tracker.break_types_description'),
          keywords: ['Time Tracker', 'Breaks'],
        },
      ],
    },
    {
      label: t('settings.attendance.title'),
      items: [
        {
          name: 'attendance_display',
          label: t('settings.attendance.display'),
          icon: ClipboardList,
          description: t('settings.attendance.display_description'),
          keywords: ['Attendance', 'Display', 'Members', 'Managers', 'Totals'],
        },
      ],
    },
    {
      label: t('common.inventory'),
      items: [
        {
          name: 'referrals',
          label: t('inventory.referral_reward_type'),
          icon: Ticket,
          description: t('user-data-table.referral_settings_desc'),
          keywords: ['Referral', 'Promotion', 'Reward'],
        },
      ],
    },
    {
      label: t('settings.finance.title'),
      items: [
        {
          name: 'finance_navigation',
          label: t('settings.finance.navigation'),
          icon: Compass,
          description: t('settings.finance.navigation_description'),
          keywords: ['Finance', 'Navigation', 'Default', 'Route'],
        },
        {
          name: 'invoice_visibility',
          label: t('settings.finance.invoice_visibility'),
          icon: FileText,
          description: t('settings.finance.invoice_visibility_description'),
          keywords: ['Finance', 'Invoice', 'Visibility', 'Show', 'Hide'],
        },
        {
          name: 'transaction_defaults',
          label: t('settings.finance.transaction_defaults'),
          icon: LayoutGrid,
          description: t('settings.finance.transaction_defaults_description'),
          keywords: [
            'Finance',
            'Wallet',
            'Category',
            'Transaction',
            'Defaults',
          ],
        },
        {
          name: 'default_currency',
          label: t('settings.finance.default_currency'),
          icon: Coins,
          description: t('settings.finance.default_currency_description'),
          keywords: ['Finance', 'Currency', 'VND', 'USD'],
        },
        {
          name: 'invoice_settings',
          label: t('settings.finance.invoice_settings'),
          icon: CreditCard,
          description: t('settings.finance.invoice_settings_description'),
          keywords: ['Finance', 'Invoice', 'Attendance', 'Promotions'],
        },
        {
          name: 'debt_loan_categories',
          label: t('settings.finance.debt_loan_categories'),
          icon: HandCoins,
          description: t('settings.finance.debt_loan_categories_description'),
          keywords: ['Finance', 'Debt', 'Loan', 'Borrow', 'Lend'],
        },
        {
          name: 'experimental_finance',
          label: t('ws-finance-settings.experimental_title'),
          icon: FlaskConical,
          description: t('ws-finance-settings.experimental_description'),
          keywords: ['Experimental', 'Finance', 'Momo', 'ZaloPay'],
        },
      ],
    },
  ];
}
