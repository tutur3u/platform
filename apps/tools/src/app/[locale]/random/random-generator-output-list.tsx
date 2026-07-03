'use client';

import { Copy, ShieldCheck } from '@tuturuuu/icons/lucide-static';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { GeneratedRandomValue } from './random-generator';

interface RandomGeneratorOutputListProps {
  error: string | null;
  onCopyAll: () => void;
  onCopyValue: (value: string) => void;
  t: (key: string, values?: Record<string, number>) => string;
  values: GeneratedRandomValue[];
}

export function RandomGeneratorOutputList({
  error,
  onCopyAll,
  onCopyValue,
  t,
  values,
}: RandomGeneratorOutputListProps) {
  if (error) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (values.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground text-sm">
        {t('outputs.empty')}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-xl">{t('outputs.title')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('outputs.description')}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={onCopyAll}>
          <Copy className="size-4" />
          {t('actions.copy_all')}
        </Button>
      </div>

      <div className="grid gap-3">
        {values.map((item, index) => (
          <div
            className="grid gap-3 rounded-lg border bg-card p-3 text-card-foreground"
            key={item.id}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t(`kinds.${item.kind}`)}</Badge>
                <Badge variant="outline">
                  <ShieldCheck className="size-3" />
                  {t('outputs.entropy_bits', {
                    bits: item.entropyBits,
                  })}
                </Badge>
              </div>
              <Button
                aria-label={t('outputs.copy_value', { index: index + 1 })}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => onCopyValue(item.value)}
              >
                <Copy className="size-4" />
                {t('actions.copy')}
              </Button>
            </div>
            <Textarea
              aria-label={t('outputs.generated_value', { index: index + 1 })}
              className="min-h-16 resize-y font-mono text-sm"
              readOnly
              value={item.value}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
