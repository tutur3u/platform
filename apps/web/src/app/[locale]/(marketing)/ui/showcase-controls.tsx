'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Switch } from '@tuturuuu/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import { categoryIds } from './component-registry';
import type {
  CategoryFilter,
  Density,
  Radius,
  ShowcaseSettings,
  Surface,
} from './showcase-types';

const densityOptions: Density[] = ['compact', 'comfortable', 'spacious'];
const radiusOptions: Radius[] = ['square', 'rounded', 'soft'];
const surfaceOptions: Surface[] = ['plain', 'muted', 'elevated'];

export function ShowcaseControls({
  category,
  categoryCounts,
  query,
  settings,
  onCategoryChange,
  onQueryChange,
  onReset,
  onSettingsChange,
}: {
  category: CategoryFilter;
  categoryCounts: Record<CategoryFilter, number>;
  query: string;
  settings: ShowcaseSettings;
  onCategoryChange: (category: CategoryFilter) => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
  onSettingsChange: (settings: ShowcaseSettings) => void;
}) {
  const t = useTranslations('ui-showcase');

  return (
    <aside className="grid gap-4 lg:sticky lg:top-24">
      <div className="grid gap-2">
        <label className="font-medium text-sm" htmlFor="ui-search">
          {t('controls.search')}
        </label>
        <Input
          id="ui-search"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('controls.searchPlaceholder')}
          value={query}
        />
      </div>

      <div className="grid gap-2">
        <div className="font-medium text-sm">{t('controls.categories')}</div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onCategoryChange('all')}
            size="sm"
            variant={category === 'all' ? 'default' : 'outline'}
          >
            {t('controls.all')}
            <Badge variant="secondary">{categoryCounts.all}</Badge>
          </Button>
          {categoryIds.map((id) => (
            <Button
              key={id}
              onClick={() => onCategoryChange(id)}
              size="sm"
              variant={category === id ? 'default' : 'outline'}
            >
              {t(`categories.${id}`)}
              <Badge variant="secondary">{categoryCounts[id]}</Badge>
            </Button>
          ))}
        </div>
      </div>

      <ControlGroup
        label={t('controls.density')}
        onValueChange={(value) =>
          value && onSettingsChange({ ...settings, density: value as Density })
        }
        options={densityOptions}
        tPrefix="controls.densityOptions"
        value={settings.density}
      />
      <ControlGroup
        label={t('controls.radius')}
        onValueChange={(value) =>
          value && onSettingsChange({ ...settings, radius: value as Radius })
        }
        options={radiusOptions}
        tPrefix="controls.radiusOptions"
        value={settings.radius}
      />
      <ControlGroup
        label={t('controls.surface')}
        onValueChange={(value) =>
          value && onSettingsChange({ ...settings, surface: value as Surface })
        }
        options={surfaceOptions}
        tPrefix="controls.surfaceOptions"
        value={settings.surface}
      />

      <div className="grid gap-3 rounded-lg border bg-background p-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t('controls.showCode')}</span>
          <Switch
            checked={settings.showCode}
            onCheckedChange={(showCode) =>
              onSettingsChange({ ...settings, showCode })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t('controls.showCustomizations')}</span>
          <Switch
            checked={settings.showCustomizations}
            onCheckedChange={(showCustomizations) =>
              onSettingsChange({ ...settings, showCustomizations })
            }
          />
        </label>
      </div>

      <Button onClick={onReset} variant="secondary">
        {t('controls.reset')}
      </Button>
    </aside>
  );
}

function ControlGroup<T extends string>({
  label,
  onValueChange,
  options,
  tPrefix,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: T[];
  tPrefix: string;
  value: T;
}) {
  const t = useTranslations('ui-showcase');
  const tx = t as unknown as (key: string) => string;

  return (
    <div className="grid gap-2">
      <div className="font-medium text-sm">{label}</div>
      <ToggleGroup
        className="flex-wrap justify-start"
        onValueChange={onValueChange}
        type="single"
        value={value}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {tx(`${tPrefix}.${option}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
