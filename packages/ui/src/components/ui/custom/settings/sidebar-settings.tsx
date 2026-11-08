'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { SidebarBehavior } from '../sidebar-context';

interface SidebarSettingsProps {
  useSidebar: () => {
    behavior: SidebarBehavior;
    handleBehaviorChange: (behavior: SidebarBehavior) => void;
    localOverride: boolean;
    setLocalOverride: (value: boolean) => void;
  };
  /** App-specific `SettingItemTab` rows appended to the same section. */
  children?: ReactNode;
}

const BEHAVIOR_TILE_CLASS =
  'flex cursor-pointer items-center justify-center rounded-lg border bg-background px-3 py-2 font-normal hover:bg-accent hover:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-foreground peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-foreground';

export default function SidebarSettings({
  useSidebar,
  children,
}: SidebarSettingsProps) {
  const t = useTranslations();
  const { behavior, handleBehaviorChange, localOverride, setLocalOverride } =
    useSidebar();

  const [hideExperimental, setHideExperimental] = useLocalStorage(
    'sidebar-hide-experimental',
    false
  );

  const {
    value: expandSettingsAccordions,
    setValue: setExpandSettingsAccordions,
    isLoading: isLoadingExpandAccordions,
  } = useUserBooleanConfig('EXPAND_SETTINGS_ACCORDIONS', true);

  return (
    <SettingsSection>
      <SettingItemTab
        layout="stacked"
        title={t('settings.preferences.sidebar_behavior')}
        description={t('settings.preferences.sidebar_behavior_description')}
      >
        <RadioGroup
          value={behavior}
          onValueChange={(value) =>
            handleBehaviorChange(value as SidebarBehavior)
          }
          className="grid @md:grid-cols-4 grid-cols-2 gap-3"
        >
          <div>
            <RadioGroupItem
              value="expanded"
              id="expanded"
              className="peer sr-only"
            />
            <Label htmlFor="expanded" className={BEHAVIOR_TILE_CLASS}>
              {t('settings.preferences.sidebar_expanded')}
            </Label>
          </div>
          <div>
            <RadioGroupItem
              value="collapsed"
              id="collapsed"
              className="peer sr-only"
            />
            <Label htmlFor="collapsed" className={BEHAVIOR_TILE_CLASS}>
              {t('settings.preferences.sidebar_collapsed')}
            </Label>
          </div>
          <div>
            <RadioGroupItem value="hover" id="hover" className="peer sr-only" />
            <Label htmlFor="hover" className={BEHAVIOR_TILE_CLASS}>
              {t('settings.preferences.sidebar_hover')}
            </Label>
          </div>
          <div>
            <RadioGroupItem
              value="hidden"
              id="hidden"
              className="peer sr-only"
            />
            <Label htmlFor="hidden" className={BEHAVIOR_TILE_CLASS}>
              {t('settings.preferences.sidebar_hidden')}
            </Label>
          </div>
        </RadioGroup>
      </SettingItemTab>

      <SettingItemTab
        title={t('settings.preferences.sidebar_local_override')}
        description={t(
          'settings.preferences.sidebar_local_override_description'
        )}
      >
        <Switch checked={localOverride} onCheckedChange={setLocalOverride} />
      </SettingItemTab>

      <SettingItemTab
        title={t('settings.preferences.expand_settings_accordions')}
        description={t(
          'settings.preferences.expand_settings_accordions_description'
        )}
      >
        <Switch
          checked={expandSettingsAccordions}
          onCheckedChange={setExpandSettingsAccordions}
          disabled={isLoadingExpandAccordions}
        />
      </SettingItemTab>

      <SettingItemTab
        title={t('settings-account.hide-experimental-on-sidebar')}
        description={t(
          'settings-account.hide-experimental-on-sidebar-description'
        )}
      >
        <Switch
          checked={hideExperimental}
          onCheckedChange={setHideExperimental}
        />
      </SettingItemTab>

      {children}
    </SettingsSection>
  );
}
