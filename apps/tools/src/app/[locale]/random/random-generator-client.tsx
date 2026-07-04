'use client';

import {
  Fingerprint,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type GeneratedRandomValue,
  generateRandomValues,
} from './random-generator';
import { RandomGeneratorControls } from './random-generator-controls';
import { RandomGeneratorOutputList } from './random-generator-output-list';
import {
  buildRandomGeneratorOptions,
  DEFAULT_RANDOM_GENERATOR_SETTINGS,
  type RandomGeneratorSettings,
  type RandomGeneratorTab,
} from './random-generator-state';

type ErrorKey =
  | 'clipboard_failed'
  | 'no_secure_crypto'
  | 'select_password_class';

export default function RandomGeneratorClient() {
  const t = useTranslations('random_generator');
  const [settings, setSettings] = useState<RandomGeneratorSettings>(
    DEFAULT_RANDOM_GENERATOR_SETTINGS
  );
  const [values, setValues] = useState<GeneratedRandomValue[]>([]);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [lastCopyLabel, setLastCopyLabel] = useState<string | null>(null);

  const generatorOptions = useMemo(
    () => buildRandomGeneratorOptions(settings),
    [settings]
  );
  const translate = useCallback(
    (key: string, values?: Record<string, number | string>) =>
      (t as (key: string, values?: Record<string, number | string>) => string)(
        key,
        values
      ),
    [t]
  );

  const runGeneration = useCallback(() => {
    if (!generatorOptions) {
      setValues([]);
      setErrorKey('select_password_class');
      return;
    }

    try {
      setValues(generateRandomValues(generatorOptions));
      setErrorKey(null);
    } catch {
      setValues([]);
      setErrorKey('no_secure_crypto');
    }
  }, [generatorOptions]);

  useEffect(() => {
    runGeneration();
  }, [runGeneration]);

  const updateSettings = useCallback(
    (nextSettings: Partial<RandomGeneratorSettings>) => {
      setSettings((currentSettings) => ({
        ...currentSettings,
        ...nextSettings,
      }));
    },
    []
  );

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setLastCopyLabel(label);
      setErrorKey(null);
    } catch {
      setErrorKey('clipboard_failed');
    }
  }, []);

  const copyAll = useCallback(() => {
    void copyText(
      values.map((item) => item.value).join('\n'),
      t('actions.copy_all')
    );
  }, [copyText, t, values]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-24 pb-16 md:px-8">
      <header className="grid gap-4">
        <div className="flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-1 text-muted-foreground text-sm">
          <ShieldCheck className="size-4" />
          {t('eyebrow')}
        </div>
        <div className="grid max-w-3xl gap-3">
          <h1 className="font-semibold text-4xl tracking-normal md:text-5xl">
            {t('title')}
          </h1>
          <p className="text-lg text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <Tabs
        className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]"
        value={settings.activeTab}
        onValueChange={(value) =>
          updateSettings({ activeTab: value as RandomGeneratorTab })
        }
      >
        <section className="grid content-start gap-4">
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="ids">
              <Fingerprint className="size-4" />
              {t('tabs.ids')}
            </TabsTrigger>
            <TabsTrigger value="tokens">
              <Sparkles className="size-4" />
              {t('tabs.tokens')}
            </TabsTrigger>
            <TabsTrigger value="passwords">
              <Lock className="size-4" />
              {t('tabs.passwords')}
            </TabsTrigger>
          </TabsList>

          <RandomGeneratorControls
            settings={settings}
            t={translate}
            onSettingsChange={updateSettings}
          />

          <Button
            disabled={!generatorOptions}
            type="button"
            onClick={runGeneration}
          >
            <RefreshCw className="size-4" />
            {t('actions.regenerate')}
          </Button>

          <p className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-sm">
            {t('privacy_note')}
          </p>
          {lastCopyLabel && (
            <p aria-live="polite" className="text-muted-foreground text-sm">
              {t('actions.copied', { label: lastCopyLabel })}
            </p>
          )}
        </section>

        <section className="min-w-0">
          <RandomGeneratorOutputList
            error={errorKey ? translate(`errors.${errorKey}`) : null}
            values={values}
            t={translate}
            onCopyAll={copyAll}
            onCopyValue={(value) => void copyText(value, t('actions.copy'))}
          />
        </section>
      </Tabs>
    </main>
  );
}
