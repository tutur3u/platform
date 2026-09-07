'use client';

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
  rows,
  title,
}: {
  rows: ShortcutRow[];
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-medium text-sm">{title}</h3>
      <div className="divide-y rounded-md border">
        {rows.map((row) => (
          <div
            className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3 py-2"
            key={row.label}
          >
            <span className="text-sm">{row.label}</span>
            <ShortcutKeys sequences={row.keys} />
          </div>
        ))}
      </div>
    </section>
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
    <div className="space-y-6">
      <ShortcutGroup rows={globalRows} title={t('global')} />
      <ShortcutGroup
        title={t('calendar_views')}
        rows={[
          { label: t('calendar_day'), keys: [['D']] },
          { label: t('calendar_four_days'), keys: [['4']] },
          { label: t('calendar_week'), keys: [['W']] },
          { label: t('calendar_month'), keys: [['M']] },
          { label: t('calendar_year'), keys: [['Y']] },
          { label: t('calendar_agenda'), keys: [['A']] },
        ]}
      />
      <p className="text-muted-foreground text-sm">
        {t('page_shortcuts_hint')}
      </p>
      <ShortcutGroup rows={dialogRows} title={t('settings_dialog')} />
    </div>
  );
}
