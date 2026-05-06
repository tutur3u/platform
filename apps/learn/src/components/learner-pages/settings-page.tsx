'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Languages, Moon, Sun, Target } from '@tuturuuu/icons';
import { getTulearnBootstrap } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { LanguageSwitcher } from '../language-switcher';
import { type IconComponent, Section, usePageMotion } from './shared';

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
    mutationFn: async () => {
      const response = await fetch('/api/settings/profile', {
        body: JSON.stringify({ displayName, email: email || undefined }),
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Unable to update profile');
    },
  });

  return (
    <Section
      description={t('settings.description')}
      refValue={scopeRef}
      title={t('settings.title')}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div
          className="rounded-[2rem] border border-border bg-card p-6 shadow-sm"
          data-tulearn-reveal
        >
          <h2 className="font-bold text-2xl tracking-normal">
            {t('settings.profile')}
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">{t('settings.displayName')}</Label>
              <Input
                className="h-12 rounded-2xl"
                id="display-name"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={bootstrap.data?.profile.display_name ?? ''}
                value={displayName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('settings.email')}</Label>
              <Input
                className="h-12 rounded-2xl"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder={bootstrap.data?.profile.email ?? ''}
                type="email"
                value={email}
              />
            </div>
          </div>
          <Button
            className="mt-6 h-12 rounded-full bg-dynamic-green text-primary-foreground hover:bg-dynamic-green/90"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>

        <div className="space-y-5">
          <SettingsPanel icon={Sun} title={t('settings.theme')}>
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-12 rounded-2xl"
                onClick={() => setTheme('light')}
                variant="secondary"
              >
                <Sun className="h-4 w-4" />
                {t('settings.light')}
              </Button>
              <Button
                className="h-12 rounded-2xl"
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
                    'min-h-11 rounded-2xl border px-4 py-3 text-left font-medium transition',
                    focusMode === mode
                      ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                      : 'border-border bg-background hover:bg-muted'
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

      <div
        className="rounded-[2rem] border border-dynamic-blue/20 bg-dynamic-blue/10 p-6"
        data-tulearn-reveal
      >
        <h2 className="font-bold text-2xl tracking-normal">
          {t('settings.linkedStudents')}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {bootstrap.data?.linkedStudents.length ? (
            bootstrap.data.linkedStudents.map((student) => (
              <span
                className="rounded-full border border-dynamic-blue/25 bg-background px-4 py-2 font-medium text-dynamic-blue text-sm"
                key={student.id}
              >
                {student.name ?? t('common.learner')}
              </span>
            ))
          ) : (
            <p className="text-muted-foreground">{t('common.empty')}</p>
          )}
        </div>
      </div>
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
    <div
      className="rounded-[2rem] border border-border bg-card p-5 shadow-sm"
      data-tulearn-reveal
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-dynamic-green/10 text-dynamic-green">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="font-bold text-xl tracking-normal">{title}</h2>
      </div>
      {children}
    </div>
  );
}
