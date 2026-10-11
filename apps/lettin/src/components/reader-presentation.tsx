'use client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

type Size = 'default' | 'large' | 'largest';
export function ReaderPresentation({
  children,
  active = true,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  const t = useTranslations('lettin');
  const [size, setSize] = useState<Size>('default');
  const [spacing, setSpacing] = useState<'default' | 'relaxed'>('default');
  return (
    <div
      className="lettin-reader-presentation"
      data-reader-size={active ? size : 'default'}
      data-reader-spacing={active ? spacing : 'default'}
    >
      {active && (
        <fieldset className="lettin-reader-controls mb-6 space-y-3 rounded-md border border-border p-4">
          <legend className="px-1 font-medium">
            {t('readerPresentation')}
          </legend>
          <p className="text-muted-foreground text-sm">
            {t('readerPresentationHint')}
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block space-y-1 text-sm">
              {t('readerTextSize')}
              <select
                className="block rounded-md border border-input bg-background p-2"
                value={size}
                onChange={(event) =>
                  setSize(
                    event.target.value === 'large' ||
                      event.target.value === 'largest'
                      ? event.target.value
                      : 'default'
                  )
                }
              >
                <option value="default">{t('readerSizeDefault')}</option>
                <option value="large">{t('readerSizeLarge')}</option>
                <option value="largest">{t('readerSizeLargest')}</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              {t('readerLineSpacing')}
              <select
                className="block rounded-md border border-input bg-background p-2"
                value={spacing}
                onChange={(event) =>
                  setSpacing(
                    event.target.value === 'relaxed' ? 'relaxed' : 'default'
                  )
                }
              >
                <option value="default">{t('readerSpacingDefault')}</option>
                <option value="relaxed">{t('readerSpacingRelaxed')}</option>
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={size === 'default' && spacing === 'default'}
              onClick={() => {
                setSize('default');
                setSpacing('default');
              }}
            >
              {t('readerResetPresentation')}
            </Button>
          </div>
        </fieldset>
      )}
      {children}
    </div>
  );
}
