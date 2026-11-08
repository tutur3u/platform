'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Kbd } from '@tuturuuu/ui/kbd';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { useTranslations } from 'next-intl';

interface ShortcutRow {
  label: string;
  keys: string[][];
}

function ShortcutKeys({ sequences }: { sequences: string[][] }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {sequences.map((sequence) => (
        <div
          className="inline-flex items-center gap-1"
          key={sequence.join('+')}
        >
          {sequence.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </div>
      ))}
    </div>
  );
}

function ShortcutGroup({
  description,
  rows,
  title,
}: {
  description?: string;
  rows: ShortcutRow[];
  title: string;
}) {
  return (
    <SettingsSection description={description} title={title}>
      {rows.map((row) => (
        <SettingItemTab key={row.label} title={row.label}>
          <ShortcutKeys sequences={row.keys} />
        </SettingItemTab>
      ))}
    </SettingsSection>
  );
}

export function KeyboardShortcutsSettings() {
  const t = useTranslations('settings.keyboard_shortcuts');
  const { modKey, modKeyAlt } = usePlatform();

  const globalRows: ShortcutRow[] = [
    { label: t('open_commands'), keys: [[modKey, 'K']] },
    { label: t('open_apps'), keys: [[modKey, 'Shift', 'K']] },
    {
      label: t('open_settings'),
      keys: [[modKey, ',']],
    },
    {
      label: t('toggle_sidebar'),
      keys: [[modKey, 'B']],
    },
    {
      label: t('hide_sidebar'),
      keys: [[modKey, modKeyAlt, 'B']],
    },
  ];

  const dialogRows: ShortcutRow[] = [
    {
      label: t('search_settings'),
      keys: [[modKey, 'F'], ['/']],
    },
    {
      label: t('next_section'),
      keys: [[modKeyAlt, 'Arrow Down']],
    },
    {
      label: t('previous_section'),
      keys: [[modKeyAlt, 'Arrow Up']],
    },
    {
      label: t('first_section'),
      keys: [[modKeyAlt, 'Home']],
    },
    {
      label: t('last_section'),
      keys: [[modKeyAlt, 'End']],
    },
    {
      label: t('close_settings'),
      keys: [['Esc']],
    },
  ];

  return (
    <div className="space-y-8">
      <ShortcutGroup rows={globalRows} title={t('global')} />
      <ShortcutGroup
        title={t('calendar_views')}
        description={t('page_shortcuts_hint')}
        rows={[
          { label: t('calendar_day'), keys: [['D']] },
          { label: t('calendar_four_days'), keys: [['4']] },
          { label: t('calendar_week'), keys: [['W']] },
          { label: t('calendar_month'), keys: [['M']] },
          { label: t('calendar_year'), keys: [['Y']] },
          { label: t('calendar_agenda'), keys: [['A']] },
        ]}
      />
      <ShortcutGroup rows={dialogRows} title={t('settings_dialog')} />
    </div>
  );
}
