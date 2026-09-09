import { Globe, Palette, PanelLeft, UserRound } from '@tuturuuu/icons';
import { updateConnectedOnboardingProgress } from '@tuturuuu/internal-api/onboarding';
import { Button } from '@tuturuuu/ui/button';
import { SatelliteLanguageItem } from '@tuturuuu/ui/custom/satellite-language-item';
import { SatelliteOnboardingSettingsPanel } from '@tuturuuu/ui/custom/satellite-onboarding-settings-panel';
import { SatelliteSettingsDialogShell } from '@tuturuuu/ui/custom/satellite-settings-dialog-shell';
import { SatelliteThemeDropdownItems } from '@tuturuuu/ui/custom/satellite-theme-dropdown-items';
import {
  type SidebarBehavior,
  useSidebar,
} from '@tuturuuu/ui/custom/sidebar-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useContext, useState } from 'react';
import {
  type Locale,
  LocalePreferenceContext,
  useCopy,
  useShellCopy,
} from './i18n';

export function ColabSettings({
  onLocaleChange,
  onClose,
  onReport,
}: {
  onLocaleChange: (locale: Locale | undefined) => void;
  onClose: () => void;
  onReport: () => void;
}) {
  const c = useCopy();
  const t = useShellCopy();
  const sidebar = useSidebar();
  const [activeTab, setActiveTab] = useState('preferences');
  const [pending, setPending] = useState<'replay' | 'restart' | null>(null);
  const preference = useContext(LocalePreferenceContext);
  return (
    <SatelliteSettingsDialogShell
      t={t}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      persistedTab={activeTab}
      setPersistedTab={setActiveTab}
      keyboardNavigation
      navItems={[
        {
          label: c.settings,
          items: [
            {
              name: 'preferences',
              label: c.preferencesTitle,
              icon: Palette,
              description: c.preferencesHelp,
            },
            { name: 'profile', label: c.manageProfile, icon: UserRound },
          ],
        },
      ]}
      onboardingPanel={
        <SatelliteOnboardingSettingsPanel
          t={(key) => t(`onboarding_guide.${key}`)}
          pending={pending}
          replayApp={() => {
            onClose();
            location.hash = 'explore';
          }}
          restartJourney={async () => {
            setPending('restart');
            await updateConnectedOnboardingProgress({
              completed_missions: [],
              dismissed_at: null,
              goals: [],
              guidance_mode: 'standard',
              journey_revision: 2,
              persona: null,
              replay_app: 'platform',
            }).catch(() => null);
            location.assign('https://tuturuuu.com/personal?guide=platform');
          }}
          shareFeedback={() => {
            onClose();
            onReport();
          }}
        />
      }
    >
      {activeTab === 'profile' ? (
        <Button variant="outline" asChild>
          <a
            href="https://tuturuuu.com/personal?settingsDialog=open&settingsTab=profile"
            target="_blank"
            rel="noopener noreferrer"
          >
            <UserRound className="h-4 w-4" />
            {c.manageProfile}
          </a>
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="settings-row">
            <span className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4" />
              {c.language}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  {preference === 'vi'
                    ? 'Tiếng Việt'
                    : preference === 'en'
                      ? 'English'
                      : t('common.system')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <SatelliteLanguageItem
                  label="English"
                  selected={preference === 'en'}
                  onSelect={() => onLocaleChange('en')}
                />
                <SatelliteLanguageItem
                  label="Tiếng Việt"
                  selected={preference === 'vi'}
                  onSelect={() => onLocaleChange('vi')}
                />
                <DropdownMenuSeparator />
                <SatelliteLanguageItem
                  label={t('common.system')}
                  selected={!preference}
                  system
                  onSelect={() => onLocaleChange(undefined)}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="settings-row">
            <span className="flex items-center gap-2 text-sm">
              <Palette className="h-4 w-4" />
              {t('common.theme')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">{t('common.theme')}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <SatelliteThemeDropdownItems t={(key) => t(`common.${key}`)} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="settings-row">
            <span className="flex items-center gap-2 text-sm">
              <PanelLeft className="h-4 w-4" />
              {t('common.sidebar')}
            </span>
            <Select
              value={sidebar.behavior}
              onValueChange={(value) =>
                sidebar.handleBehaviorChange(value as SidebarBehavior)
              }
            >
              <SelectTrigger className="w-full min-[761px]:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['expanded', 'collapsed', 'hover', 'hidden'] as const).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {t(
                        `common.${value === 'hover' ? 'expand_on_hover' : value}`
                      )}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </SatelliteSettingsDialogShell>
  );
}
