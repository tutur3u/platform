'use client';

import { ChevronDown, Save, Settings } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import { ModelMultiSelect } from './model-multi-select';
import type { AiStudioGlobalSettings } from './types';

export function GlobalAiStudioSettingsSection({
  isPending,
  onSave,
  settings,
  setSettings,
}: {
  isPending: boolean;
  onSave: () => void;
  settings: AiStudioGlobalSettings;
  setSettings: Dispatch<SetStateAction<AiStudioGlobalSettings>>;
}) {
  const t = useTranslations('ai-studio-admin');
  const [open, setOpen] = useState(false);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-muted/30 md:flex-row md:items-center md:justify-between"
            type="button"
          >
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <Settings className="h-4 w-4 text-primary" />
                {t('global.title')}
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('global.description')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {t('global.models_summary', {
                  count: settings.defaultModels.length,
                })}
              </Badge>
              <Badge variant="outline">
                {t('global.retention_summary', {
                  content: settings.contentRetentionDays,
                  metadata: settings.metadataRetentionDays,
                })}
              </Badge>
              <Badge
                variant={settings.captureDefaultEnabled ? 'default' : 'outline'}
              >
                {settings.captureDefaultEnabled
                  ? t('global.capture_enabled')
                  : t('global.capture_disabled')}
              </Badge>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid gap-5 border-t p-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>{t('global.default_models')}</Label>
              <ModelMultiSelect
                emptyLabel={t('models.empty')}
                loadMoreLabel={t('models.load_more')}
                loadingLabel={t('models.loading')}
                onChange={(defaultModels) =>
                  setSettings((current) => ({ ...current, defaultModels }))
                }
                placeholder={t('global.models_placeholder')}
                removeLabel={(modelId) => t('models.remove', { modelId })}
                searchPlaceholder={t('models.search')}
                selectedCountLabel={(count) =>
                  t('models.selected_count', { count })
                }
                value={settings.defaultModels}
              />
              <p className="text-muted-foreground text-xs">
                {t('global.models_hint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metadata-retention">
                {t('global.metadata_retention')}
              </Label>
              <Input
                id="metadata-retention"
                max={2555}
                min={30}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    metadataRetentionDays: Number(event.target.value),
                  }))
                }
                type="number"
                value={settings.metadataRetentionDays}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-retention">
                {t('global.content_retention')}
              </Label>
              <Input
                id="content-retention"
                max={365}
                min={1}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    contentRetentionDays: Number(event.target.value),
                  }))
                }
                type="number"
                value={settings.contentRetentionDays}
              />
            </div>
            <ToggleSetting
              checked={settings.captureDefaultEnabled}
              className="md:col-span-2"
              description={t('global.capture_default_description')}
              label={t('global.capture_default')}
              onCheckedChange={(captureDefaultEnabled) =>
                setSettings((current) => ({
                  ...current,
                  captureDefaultEnabled,
                }))
              }
            />
          </div>
          <div className="flex justify-end border-t bg-muted/10 p-4">
            <Button disabled={isPending} onClick={onSave}>
              <Save className="mr-2 h-4 w-4" />
              {t('save')}
            </Button>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function ToggleSetting({
  checked,
  className,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  className?: string;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${className ?? ''}`}
    >
      <div>
        <Label>{label}</Label>
        <p className="mt-1 text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
