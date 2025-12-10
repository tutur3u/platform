'use client';

import { Bell, Globe, Monitor, Moon, Settings, Sun } from '@tuturuuu/icons';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PreferencesData } from '../../types';
import { NavigationButtons } from '../shared/navigation-buttons';
import {
  OnboardingCard,
  OnboardingHeader,
  OnboardingLayout,
} from '../shared/onboarding-card';

interface PreferencesScreenProps {
  onContinue: (preferences: PreferencesData) => void;
  onBack: () => void;
  onSkip: () => void;
  initialData?: Partial<PreferencesData>;
  loading?: boolean;
}

type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeOptionConfig {
  id: ThemeOption;
  icon: typeof Sun;
}

const themeOptions: ThemeOptionConfig[] = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: Monitor },
];

interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

const languageOptions: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tieng Viet' },
];

export function PreferencesScreen({
  onContinue,
  onBack,
  onSkip,
  initialData,
  loading = false,
}: PreferencesScreenProps) {
  const t = useTranslations('onboarding.preferences');
  const { setTheme, theme: currentTheme } = useTheme();

  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>(
    (initialData?.theme ?? (currentTheme as ThemeOption)) || 'system'
  );
  const [selectedLanguage, setSelectedLanguage] = useState(
    initialData?.language || 'en'
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    initialData?.notificationsEnabled ?? true
  );

  const handleThemeChange = (newTheme: ThemeOption) => {
    setSelectedTheme(newTheme);
    setTheme(newTheme);
  };

  const handleContinue = () => {
    onContinue({
      theme: selectedTheme,
      language: selectedLanguage,
      notificationsEnabled,
    });
  };

  return (
    <OnboardingLayout>
      <OnboardingCard direction="forward">
        <OnboardingHeader
          icon={<Settings className="h-8 w-8 text-primary" />}
          title={t('title')}
          subtitle={t('subtitle')}
        />

        <div className="space-y-8">
          {/* Theme Selection */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Label className="mb-3 block font-medium text-base">
              {t('theme.label')}
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedTheme === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleThemeChange(option.id)}
                    disabled={loading}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200',
                      'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-6 w-6 transition-colors',
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <span
                      className={cn(
                        'font-medium text-sm',
                        isSelected ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {t(`theme.${option.id}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Language Selection */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <Label className="mb-3 block font-medium text-base">
              <Globe className="mr-2 inline h-4 w-4" />
              {t('language.label')}
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {languageOptions.map((option) => {
                const isSelected = selectedLanguage === option.code;

                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => setSelectedLanguage(option.code)}
                    disabled={loading}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border-2 p-4 transition-all duration-200',
                      'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    )}
                  >
                    <span
                      className={cn(
                        'font-medium',
                        isSelected ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {option.nativeName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {option.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Notifications Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex items-center justify-between rounded-xl border p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label className="font-medium">
                  {t('notifications.label')}
                </Label>
                <p className="text-muted-foreground text-sm">
                  {t('notifications.description')}
                </p>
              </div>
            </div>
            <Switch
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
              disabled={loading}
            />
          </motion.div>
        </div>

        <NavigationButtons
          onBack={onBack}
          onContinue={handleContinue}
          onSkip={onSkip}
          backLabel={t('back')}
          continueLabel={t('continue')}
          skipLabel={t('skip')}
          showBack={true}
          showSkip={true}
          loading={loading}
        />
      </OnboardingCard>
    </OnboardingLayout>
  );
}
