'use client';
import type { LettinWorkProgress } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { workProgressOptions } from '../work-progress';

type Props = {
  disabled?: boolean;
} & (
  | {
      includeAll: true;
      value: LettinWorkProgress | 'all';
      onChange: (value: LettinWorkProgress | 'all') => void;
    }
  | {
      includeAll?: false;
      value: LettinWorkProgress;
      onChange: (value: LettinWorkProgress) => void;
    }
);

export function WorkProgressControl(props: Props) {
  const t = useTranslations('lettin');
  return (
    <label className="block space-y-2 text-sm">
      <span>{t(props.includeAll ? 'workProgressFilter' : 'workProgress')}</span>
      <select
        className="block w-full rounded border border-input bg-background p-2"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (props.includeAll && next === 'all') props.onChange('all');
          const progress = workProgressOptions.find((value) => value === next);
          if (progress) props.onChange(progress);
        }}
      >
        {props.includeAll && (
          <option value="all">{t('workProgressAll')}</option>
        )}
        {workProgressOptions.map((progress) => (
          <option key={progress} value={progress}>
            {t(`workProgress_${progress}`)}
          </option>
        ))}
      </select>
      {!props.includeAll && (
        <span className="text-muted-foreground text-xs">
          {t('workProgressHint')}
        </span>
      )}
    </label>
  );
}
