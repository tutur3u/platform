'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Languages, Moon, Sun, Target } from '@tuturuuu/icons';
import {
  getTulearnBootstrap,
  updateTulearnProfile,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { LanguageSwitcher } from '../language-switcher';
import {
  BrutalCard,
  BrutalIcon,
  type IconComponent,
  Section,
  usePageMotion,
} from './shared';

export function SettingsPage() {
  const t = useTranslations();
  const { setTheme } = useTheme();
  const scopeRef = usePageMotion();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [focusMode, setFocusMode] = useState('balanced');
  const bootstrap = useQuery({
    queryFn: () => getTulearnBootstrap(),
    queryKey: ['tulearn', 'bootstrap'],
  });
  const save = useMutation({
    mutationFn: () =>
      updateTulearnProfile({ displayName, email: email || undefined }),
  });

  return (
    <Section
      description={t('settings.description')}
      refValue={scopeRef}
      title={t('settings.title')}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <BrutalCard className="p-6">
          <h2 className="font-bold text-2xl tracking-normal">
            {t('settings.profile')}
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">{t('settings.displayName')}</Label>
              <Input
                className="h-12 rounded-none border-2 border-foreground"
                id="display-name"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={bootstrap.data?.profile.display_name ?? ''}
                value={displayName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('settings.email')}</Label>
              <Input
                className="h-12 rounded-none border-2 border-foreground"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder={bootstrap.data?.profile.email ?? ''}
                type="email"
                value={email}
              />
            </div>
          </div>
          <Button
            className="mt-6 h-12 rounded-none border-2 border-foreground bg-dynamic-yellow font-black text-foreground shadow-[4px_4px_0_var(--foreground)] hover:bg-dynamic-yellow active:translate-x-1 active:translate-y-1 active:shadow-none"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </BrutalCard>

        <div className="space-y-5">
          <SettingsPanel icon={Sun} title={t('settings.theme')}>
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-12 rounded-none border-2 border-foreground font-black shadow-[3px_3px_0_var(--foreground)]"
                onClick={() => setTheme('light')}
                variant="secondary"
              >
                <Sun className="h-4 w-4" />
                {t('settings.light')}
              </Button>
              <Button
                className="h-12 rounded-none border-2 border-foreground font-black shadow-[3px_3px_0_var(--foreground)]"
                onClick={() => setTheme('dark')}
                variant="secondary"
              >
                <Moon className="h-4 w-4" />
                {t('settings.dark')}
              </Button>
            </div>
          </SettingsPanel>

          <SettingsPanel icon={Target} title={t('settings.focusMode')}>
            <div className="grid gap-2">
              {['light', 'balanced', 'challenge'].map((mode) => (
                <button
                  className={cn(
                    'min-h-11 border-2 border-foreground px-4 py-3 text-left font-black shadow-[3px_3px_0_var(--foreground)] transition active:translate-x-1 active:translate-y-1 active:shadow-none',
                    focusMode === mode
                      ? 'bg-dynamic-yellow text-foreground'
                      : 'bg-background hover:bg-dynamic-yellow/15'
                  )}
                  key={mode}
                  onClick={() => setFocusMode(mode)}
                  type="button"
                >
                  {t(`settings.focus.${mode}`)}
                </button>
              ))}
            </div>
          </SettingsPanel>

          <SettingsPanel icon={Languages} title={t('settings.language')}>
            <LanguageSwitcher />
          </SettingsPanel>
        </div>
      </div>

      <BrutalCard className="bg-dynamic-yellow/15 p-6">
        <h2 className="font-bold text-2xl tracking-normal">
          {t('settings.linkedStudents')}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {bootstrap.data?.linkedStudents.length ? (
            bootstrap.data.linkedStudents.map((student) => (
              <span
                className="border-2 border-foreground bg-background px-4 py-2 font-black text-sm shadow-[3px_3px_0_var(--foreground)]"
                key={student.id}
              >
                {student.name ?? t('common.learner')}
              </span>
            ))
          ) : (
            <p className="text-muted-foreground">{t('common.empty')}</p>
          )}
        </div>
      </BrutalCard>
    </Section>
  );
}

function SettingsPanel({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: IconComponent;
  title: string;
}) {
  return (
    <BrutalCard className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <BrutalIcon className="h-10 w-10" icon={Icon} />
        <h2 className="font-bold text-xl tracking-normal">{title}</h2>
      </div>
      {children}
    </BrutalCard>
  );
}
