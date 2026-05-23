'use client';

import { Trash2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { NODE_COLORS } from './model';

export function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="font-medium text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function InspectorHeader({
  badge,
  title,
  onDelete,
}: {
  badge: string;
  title: string;
  onDelete: () => void;
}) {
  const t = useTranslations('mind');
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-pretty font-semibold text-base leading-6 tracking-normal">
          {title}
        </h2>
        <Badge className="mt-2" variant="secondary">
          {badge}
        </Badge>
      </div>
      <Button
        className="h-8 w-8 shrink-0 text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
        onClick={onDelete}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">{t('delete')}</span>
      </Button>
    </div>
  );
}

export function ColorPicker({
  color,
  onChange,
}: {
  color?: string | null;
  onChange: (color: string | null) => void;
}) {
  const t = useTranslations('mind');
  return (
    <Field label={t('fields.color')}>
      <div className="flex flex-wrap gap-2">
        {NODE_COLORS.map((option) => (
          <button
            aria-label={option}
            className="h-7 w-7 rounded-full border border-border ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={option}
            onClick={() => onChange(option)}
            style={{ backgroundColor: option }}
            type="button"
          >
            {color === option ? (
              <span className="mx-auto block h-2.5 w-2.5 rounded-full bg-background" />
            ) : null}
          </button>
        ))}
        <Button
          onClick={() => onChange(null)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t('none')}
        </Button>
      </div>
    </Field>
  );
}
