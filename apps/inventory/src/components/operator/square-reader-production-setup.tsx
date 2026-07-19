'use client';

import { CheckCircle2, Copy, ExternalLink } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { SelectValueField } from './operator-form-fields';
import { SquareSetupStep } from './square-setup-step';

type SelectOption = { label: string; value: string };

export type SquareReaderProductionSetupProps = {
  activeLocationId: string;
  locationOptions: SelectOption[];
  onSaveDefaults: () => void;
  posCallbackUrl: string;
  posReady: boolean;
  saveDefaultsPending: boolean;
  selectedLocationPlaceholder: string;
  setLocationId: (value: string) => void;
};

export function SquareReaderProductionSetup({
  activeLocationId,
  locationOptions,
  onSaveDefaults,
  posCallbackUrl,
  posReady,
  saveDefaultsPending,
  selectedLocationPlaceholder,
  setLocationId,
}: SquareReaderProductionSetupProps) {
  const t = useTranslations('inventory.operator.square');

  return (
    <section className="grid gap-3">
      <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm">{t('readerSetup.title')}</p>
            <Badge variant={posReady ? 'success' : 'warning'}>
              {t(posReady ? 'readerSetup.ready' : 'readerSetup.setupRequired')}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('readerSetup.description')}
          </p>
        </div>
      </div>

      <SquareSetupStep number={1}>
        <div>
          <p className="font-medium text-sm">
            {t('readerSetup.location.title')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('readerSetup.location.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectValueField
            allowEmpty={false}
            className="min-w-[15rem] flex-1"
            label={t('locationLabel')}
            onChange={setLocationId}
            options={locationOptions}
            placeholder={selectedLocationPlaceholder}
            value={activeLocationId}
          />
          <Button
            disabled={saveDefaultsPending || !activeLocationId}
            onClick={onSaveDefaults}
            type="button"
          >
            <CheckCircle2 className="size-4" />
            {saveDefaultsPending ? t('saving') : t('readerSetup.location.save')}
          </Button>
        </div>
      </SquareSetupStep>

      <SquareSetupStep number={2}>
        <div>
          <p className="font-medium text-sm">
            {t('readerSetup.callback.title')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('readerSetup.callback.description')}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            className="min-w-0 flex-1 font-mono text-xs"
            readOnly
            value={posCallbackUrl}
          />
          <Button
            disabled={!posCallbackUrl}
            onClick={() => navigator.clipboard.writeText(posCallbackUrl)}
            type="button"
            variant="outline"
          >
            <Copy className="size-4" />
            {t('readerSetup.callback.copy')}
          </Button>
        </div>
        <Button asChild className="w-fit" size="sm" variant="ghost">
          <a
            href="https://developer.squareup.com/apps"
            rel="noreferrer"
            target="_blank"
          >
            {t('readerSetup.callback.openConsole')}
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </SquareSetupStep>

      <SquareSetupStep number={3}>
        <div>
          <p className="font-medium text-sm">{t('readerSetup.device.title')}</p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('readerSetup.device.description')}
          </p>
        </div>
        <p className="rounded-lg border border-border border-dashed p-3 text-muted-foreground text-xs leading-5">
          {t('readerSetup.device.idHelp')}
        </p>
      </SquareSetupStep>

      <SquareSetupStep number={4}>
        <div>
          <p className="font-medium text-sm">
            {t('readerSetup.storefront.title')}
          </p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            {t('readerSetup.storefront.description')}
          </p>
        </div>
        <Button asChild className="w-fit" size="sm" variant="outline">
          <a
            href="https://developer.squareup.com/docs/pos-api/build-mobile-web"
            rel="noreferrer"
            target="_blank"
          >
            {t('readerSetup.openGuide')}
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </SquareSetupStep>
    </section>
  );
}
